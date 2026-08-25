import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ClaimedPatchApplication } from "@/lib/data/patch-applications";
import { PatchApplicationError } from "@/lib/patch-application/errors";
import { hashVerifiedPatch, validatePullRequestPreflight, validateTerraformAffectedFiles } from "@/lib/patch-application/eligibility";
import type { FreshVerificationSummary, PatchApplicationStage, PullRequestHeadSnapshot } from "@/lib/patch-application/types";
import type { PlanFailureView } from "@/lib/runs/types";
import { isEnvironmentalPlanFailureClass } from "@/lib/verification-assessment";
import type { TemporaryAwsCredentials } from "@/lib/worker/types";
import { runCommand, type CommandResult } from "@/worker/command";
import { buildRepositoryCloneUrl } from "@/worker/github";

const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const APPLICATION_TIMEOUT_MS = 15 * 60_000;

export interface PatchApplicationStore {
  updateProgress(id: string, stage: PatchApplicationStage): Promise<void>;
  recordFreshVerification(id: string, verification: FreshVerificationSummary): Promise<void>;
  recordIntendedCommit(id: string, commitSha: string, verification: FreshVerificationSummary): Promise<void>;
  markApplied(id: string, input: { commitSha: string; commitUrl: string; pullRequestUrl: string; verification?: FreshVerificationSummary }): Promise<void>;
  markError(id: string, code: PatchApplicationError["code"], message: string, status: PatchApplicationError["terminalStatus"]): Promise<void>;
}

export interface PatchApplicationDependencies {
  store: PatchApplicationStore;
  github: {
    inspect(run: ClaimedPatchApplication): Promise<{ snapshot: PullRequestHeadSnapshot; contentsPermission: string | null; token: string }>;
  };
  aws: { assume(run: ClaimedPatchApplication, signal?: AbortSignal): Promise<TemporaryAwsCredentials> };
  commands?: typeof runCommand;
  classifyPlanFailure?: (result: CommandResult, input: { workspaceRoot: string; command: typeof runCommand; signal: AbortSignal }) => Promise<PlanFailureView>;
}

export async function processClaimedPatchApplication(run: ClaimedPatchApplication, dependencies: PatchApplicationDependencies, options: { timeoutMs?: number; onProgress?(stage: PatchApplicationStage): void } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? APPLICATION_TIMEOUT_MS);
  timer.unref();
  const command = dependencies.commands ?? runCommand;
  let workspaceRoot: string | null = null;
  const verificationMode = requestVerificationMode(run);
  let pushed = false;
  const progress = async (stage: PatchApplicationStage) => {
    await dependencies.store.updateProgress(run.id, stage);
    options.onProgress?.(stage);
  };
  try {
    requireRunState(run);
    await progress("checking_pr_head");
    let github: Awaited<ReturnType<PatchApplicationDependencies["github"]["inspect"]>>;
    try {
      github = await dependencies.github.inspect(run);
    } catch (error) {
      throw new PatchApplicationError("installation_unavailable", "REJECTED", { cause: error });
    }
    const reconciled = await reconcileIfAlreadyPushed(run, github.snapshot, dependencies.store);
    if (reconciled) return { outcome: "applied" as const, reconciled: true };
    const preflightFailure = validatePullRequestPreflight({ repositoryFullName: run.repositoryFullName, expectedHeadSha: run.expectedHeadSha, expectedHeadBranch: run.headBranch, contentsPermission: github.contentsPermission, head: github.snapshot });
    if (preflightFailure) throw new PatchApplicationError(preflightFailure, preflightFailure === "stale_pull_request" ? "STALE" : "REJECTED");

    await progress("checking_patch");
    if (hashVerifiedPatch(run.patch) !== run.patchSha256) throw new PatchApplicationError("patch_hash_mismatch", "REJECTED");
    if (!validateTerraformAffectedFiles(run.affectedFiles, run.terraformDir)) throw new PatchApplicationError("unexpected_file_change", "REJECTED");
    workspaceRoot = await mkdtemp(path.join(tmpdir(), `terrafix-apply-${run.id.slice(0, 12)}-`));
    const checkoutPath = path.join(workspaceRoot, "repository");
    const patchPath = path.join(workspaceRoot, "verified.patch");
    const terraformDataPath = path.join(workspaceRoot, "terraform-data");
    await writeFile(patchPath, run.patch, { encoding: "utf8", mode: 0o600 });
    await checkoutExactHead(run, checkoutPath, github.token, command, controller.signal);
    const verification = emptyVerification(verificationMode);
    verification.stages.patch_check = (await runStage(command, "git", ["apply", "--check", "--", patchPath], checkoutPath, safeEnvironment(), controller.signal)).stage;
    await dependencies.store.recordFreshVerification(run.id, verification);
    if (verification.stages.patch_check.status !== "passed") throw new PatchApplicationError("patch_check_failed", "REJECTED");

    await progress("applying_patch");
    verification.stages.patch_apply = (await runStage(command, "git", ["apply", "--", patchPath], checkoutPath, safeEnvironment(), controller.signal)).stage;
    await dependencies.store.recordFreshVerification(run.id, verification);
    if (verification.stages.patch_apply.status !== "passed") throw new PatchApplicationError("patch_check_failed", "REJECTED");
    await progress("verifying_files");
    await verifyChangedFiles(run, checkoutPath, command, controller.signal);

    await progress("fresh_verification");
    const credentials = verificationMode === "full"
      ? await dependencies.aws.assume(run, controller.signal)
      : null;
    await verifyTerraformVersion(run.terraformVersion, command, controller.signal);
    const terraformCwd = path.resolve(checkoutPath, run.terraformDir);
    const environment = terraformEnvironment(credentials, terraformDataPath);
    const terraformStages = [
      ["fmt", ["fmt", "-check"]],
      ["init", ["init", "-backend=false", "-input=false", "-no-color"]],
      ["validate", ["validate", "-no-color"]],
      ...(verificationMode === "full" ? [["plan", ["plan", "-input=false", "-lock=false", "-refresh=false", "-no-color"]] as const] : []),
    ] as const;
    for (const [stage, args] of terraformStages) {
      const execution = await runStage(command, "terraform", [...args], terraformCwd, environment, controller.signal);
      verification.stages[stage] = execution.stage;
      if (execution.stage.status !== "passed") {
        if (stage === "plan") {
          await dependencies.store.recordFreshVerification(run.id, verification);
          verification.planFailure = await (dependencies.classifyPlanFailure ?? classifyPlanFailureWithAgent)(execution.result, { workspaceRoot, command, signal: controller.signal });
          verification.outcome = isEnvironmentalPlanFailureClass(verification.planFailure.classification) ? "environment_blocked" : verification.planFailure.classification === "terraform_semantic" ? "semantic_failure" : "unknown_failure";
          verification.applySafety = verification.outcome === "environment_blocked" ? "conditionally_eligible" : "ineligible";
        } else {
          verification.outcome = stage === "fmt" ? "patch_invalid" : "unknown_failure";
          verification.applySafety = "ineligible";
        }
      }
      await dependencies.store.recordFreshVerification(run.id, verification);
      if (execution.stage.status !== "passed") {
        enforceFreshVerificationPolicy(run, verification);
        break;
      }
    }
    if (verification.stages.plan.status === "passed") {
      verification.outcome = "fully_verified";
      verification.applySafety = "verified";
      await dependencies.store.recordFreshVerification(run.id, verification);
      enforceFreshVerificationPolicy(run, verification);
    }
    if (verificationMode === "local" && verification.stages.validate.status === "passed") {
      verification.outcome = "locally_validated";
      verification.applySafety = "conditionally_eligible";
      await dependencies.store.recordFreshVerification(run.id, verification);
      enforceFreshVerificationPolicy(run, verification);
    }
    await verifyChangedFiles(run, checkoutPath, command, controller.signal);

    await progress("creating_commit");
    await requireCommand(command, "git", ["add", "--", ...run.affectedFiles], checkoutPath, safeEnvironment(), controller.signal, "unexpected_file_change");
    await requireCommand(command, "git", ["-c", "user.name=TerraFix Bot", "-c", "user.email=terrafix[bot]@users.noreply.github.com", "commit", "-m", "fix(terraform): apply verified TerraFix patch", "-m", `TerraFix-Agent-Run: ${run.agentRunId}\nTerraFix-Patch-SHA256: ${run.patchSha256}`], checkoutPath, safeEnvironment(), controller.signal, "fresh_verification_failed");
    const intendedCommitSha = (await requireCommand(command, "git", ["rev-parse", "HEAD"], checkoutPath, safeEnvironment(), controller.signal, "fresh_verification_failed")).stdout.trim().toLowerCase();
    if (!SHA_PATTERN.test(intendedCommitSha)) throw new PatchApplicationError("fresh_verification_failed");
    await dependencies.store.recordIntendedCommit(run.id, intendedCommitSha, verification);

    await progress("pushing_branch");
    const auth = gitAuthEnvironment(github.token);
    const remoteHead = await command("git", ["ls-remote", "--heads", buildRepositoryCloneUrl(run.repositoryFullName), `refs/heads/${run.headBranch}`], { env: auth, timeoutMs: 120_000, signal: controller.signal });
    if (remoteHead.exitCode !== 0 || remoteHead.stdout.trim().split(/\s+/)[0]?.toLowerCase() !== run.expectedHeadSha) throw new PatchApplicationError("stale_pull_request", "STALE");
    const pushedResult = await command("git", ["-C", checkoutPath, "push", buildRepositoryCloneUrl(run.repositoryFullName), `HEAD:refs/heads/${run.headBranch}`], { env: auth, timeoutMs: 120_000, signal: controller.signal });
    if (pushedResult.exitCode !== 0 || pushedResult.timedOut) {
      const observed = await dependencies.github.inspect(run).catch(() => null);
      if (observed?.snapshot.headSha === intendedCommitSha) {
        pushed = true;
        await dependencies.store.markApplied(run.id, { commitSha: intendedCommitSha, commitUrl: `https://github.com/${run.repositoryFullName}/commit/${intendedCommitSha}`, pullRequestUrl: observed.snapshot.htmlUrl, verification });
        return { outcome: "applied" as const, commitSha: intendedCommitSha, reconciled: true };
      }
      if (pushedResult.timedOut && !observed) {
        pushed = true;
        return { outcome: "uncertain" as const, errorCode: "worker_timeout" as const };
      }
      throw new PatchApplicationError("push_rejected", "STALE");
    }
    pushed = true;
    await progress("publishing_result");
    await dependencies.store.markApplied(run.id, {
      commitSha: intendedCommitSha,
      commitUrl: `https://github.com/${run.repositoryFullName}/commit/${intendedCommitSha}`,
      pullRequestUrl: github.snapshot.htmlUrl,
      verification,
    });
    return { outcome: "applied" as const, commitSha: intendedCommitSha, reconciled: false };
  } catch (error) {
    const applicationError = controller.signal.aborted
      ? new PatchApplicationError("worker_timeout")
      : error instanceof PatchApplicationError ? error : new PatchApplicationError("fresh_verification_failed", "FAILED", { cause: error });
    if (!pushed) await dependencies.store.markError(run.id, applicationError.code, applicationError.message, applicationError.terminalStatus).catch(() => undefined);
    return { outcome: pushed ? "uncertain" as const : "failed" as const, errorCode: applicationError.code };
  } finally {
    clearTimeout(timer);
    if (workspaceRoot) await rm(workspaceRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

function requireRunState(run: ClaimedPatchApplication) {
  const verificationMode = requestVerificationMode(run);
  if (!run.repositoryAccessible || !run.installationActive || (verificationMode === "full" && !run.aws?.connected)) throw new PatchApplicationError("installation_unavailable", "REJECTED");
  if (run.expectedHeadSha !== run.verifiedAgainstCommitSha) throw new PatchApplicationError("source_revision_mismatch", "REJECTED");
  if (run.eligibilityLevel === "verified") {
    if ((run.verificationOutcomeAtRequest !== "fully_verified" && run.verificationOutcomeAtRequest !== null) || run.conditionalApproval) throw new PatchApplicationError("not_mutation_eligible", "REJECTED");
    return;
  }
  if (run.eligibilityLevel !== "conditional" || run.conditionalApproval !== true) throw new PatchApplicationError("not_mutation_eligible", "REJECTED");
  if (run.verificationOutcomeAtRequest === "locally_validated" && run.verificationModeAtRequest === "local" && run.planRequestedAtRequest === false && run.conditionalApprovalKind === "local_conditional") return;
  if (run.verificationOutcomeAtRequest !== "environment_blocked" || run.verificationModeAtRequest !== "full" || run.planRequestedAtRequest !== true || run.conditionalApprovalKind !== "environment_conditional" || !isEnvironmentalPlanFailureClass(run.planFailureClassAtRequest) || !run.planFailureReasonCodeAtRequest) throw new PatchApplicationError("not_mutation_eligible", "REJECTED");
}

function requestVerificationMode(run: Pick<ClaimedPatchApplication, "verificationModeAtRequest" | "verificationOutcomeAtRequest">): "local" | "full" {
  return run.verificationModeAtRequest === "local" && run.verificationOutcomeAtRequest === "locally_validated" ? "local" : "full";
}

async function reconcileIfAlreadyPushed(run: ClaimedPatchApplication, head: PullRequestHeadSnapshot, store: PatchApplicationStore) {
  if (!run.intendedCommitSha || head.headSha !== run.intendedCommitSha) return false;
  await store.markApplied(run.id, { commitSha: run.intendedCommitSha, commitUrl: `https://github.com/${run.repositoryFullName}/commit/${run.intendedCommitSha}`, pullRequestUrl: head.htmlUrl });
  return true;
}

async function checkoutExactHead(run: ClaimedPatchApplication, checkoutPath: string, token: string, command: typeof runCommand, signal: AbortSignal) {
  await requireCommand(command, "git", ["init", checkoutPath], undefined, safeEnvironment(), signal, "stale_pull_request");
  await requireCommand(command, "git", ["-C", checkoutPath, "fetch", "--no-tags", "--depth=1", buildRepositoryCloneUrl(run.repositoryFullName), run.expectedHeadSha], undefined, gitAuthEnvironment(token), signal, "stale_pull_request");
  await requireCommand(command, "git", ["-C", checkoutPath, "checkout", "--detach", run.expectedHeadSha], undefined, safeEnvironment(), signal, "stale_pull_request");
  const actual = (await requireCommand(command, "git", ["-C", checkoutPath, "rev-parse", "HEAD"], undefined, safeEnvironment(), signal, "stale_pull_request")).stdout.trim().toLowerCase();
  if (actual !== run.expectedHeadSha) throw new PatchApplicationError("stale_pull_request", "STALE");
}

async function verifyChangedFiles(run: ClaimedPatchApplication, checkoutPath: string, command: typeof runCommand, signal: AbortSignal) {
  const result = await requireCommand(command, "git", ["-C", checkoutPath, "diff", "--name-status", "-z", "HEAD", "--"], undefined, safeEnvironment(), signal, "unexpected_file_change");
  const tokens = result.stdout.split("\0").filter(Boolean);
  const files: string[] = [];
  for (let index = 0; index < tokens.length; index += 2) {
    if (tokens[index] !== "M" || !tokens[index + 1]) throw new PatchApplicationError("unexpected_file_change", "REJECTED");
    files.push(tokens[index + 1]);
  }
  if ([...files].sort().join("\0") !== [...run.affectedFiles].sort().join("\0") || !validateTerraformAffectedFiles(files, run.terraformDir)) throw new PatchApplicationError("unexpected_file_change", "REJECTED");
  for (const file of files) {
    const existsAtHead = await command("git", ["-C", checkoutPath, "cat-file", "-e", `HEAD:${file}`], { env: safeEnvironment(), timeoutMs: 10_000, signal });
    const mode = await command("git", ["-C", checkoutPath, "ls-files", "--stage", "--", file], { env: safeEnvironment(), timeoutMs: 10_000, signal });
    if (existsAtHead.exitCode !== 0 || mode.exitCode !== 0 || (!mode.stdout.startsWith("100644 ") && !mode.stdout.startsWith("100755 "))) throw new PatchApplicationError("unexpected_file_change", "REJECTED");
  }
  const binary = await requireCommand(command, "git", ["-C", checkoutPath, "diff", "--numstat", "HEAD", "--"], undefined, safeEnvironment(), signal, "unexpected_file_change");
  if (binary.stdout.split("\n").some((line) => line.startsWith("-\t-\t"))) throw new PatchApplicationError("unexpected_file_change", "REJECTED");
}

async function verifyTerraformVersion(expected: string, command: typeof runCommand, signal: AbortSignal) {
  const result = await command("terraform", ["version", "-json"], { env: safeEnvironment(), timeoutMs: 10_000, signal });
  try {
    if (result.exitCode !== 0 || JSON.parse(result.stdout).terraform_version !== expected) throw new Error("version mismatch");
  } catch (error) {
    throw new PatchApplicationError("terraform_version_unavailable", "FAILED", { cause: error });
  }
}

async function runStage(command: typeof runCommand, executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, signal: AbortSignal) {
  const started = Date.now();
  const result = await command(executable, args, { cwd, env, timeoutMs: 180_000, signal });
  return { stage: { status: result.exitCode === 0 && !result.timedOut ? "passed" as const : "failed" as const, durationMs: Date.now() - started }, result };
}

async function requireCommand(command: typeof runCommand, executable: string, args: string[], cwd: string | undefined, env: NodeJS.ProcessEnv, signal: AbortSignal, code: PatchApplicationError["code"]): Promise<CommandResult> {
  const result = await command(executable, args, { cwd, env, timeoutMs: 120_000, signal });
  if (result.exitCode !== 0 || result.timedOut) throw new PatchApplicationError(code, code === "stale_pull_request" ? "STALE" : "FAILED");
  return result;
}

function emptyVerification(verificationMode: "local" | "full"): FreshVerificationSummary {
  return {
    verificationMode,
    planRequested: verificationMode === "full",
    stages: Object.fromEntries(["patch_check", "patch_apply", "fmt", "init", "validate", "plan"].map((stage) => [stage, { status: "not_run", durationMs: null }])) as FreshVerificationSummary["stages"],
    outcome: null,
    applySafety: null,
    planFailure: null,
  };
}

export function enforceFreshVerificationPolicy(run: Pick<ClaimedPatchApplication, "eligibilityLevel" | "verificationModeAtRequest" | "verificationOutcomeAtRequest" | "conditionalApproval" | "conditionalApprovalKind" | "planFailureClassAtRequest" | "planFailureReasonCodeAtRequest">, verification: FreshVerificationSummary) {
  if (verification.outcome === "fully_verified" && verification.applySafety === "verified") return;
  if (run.eligibilityLevel === "verified") throw new PatchApplicationError("full_verification_regressed", "FAILED");
  if (run.eligibilityLevel !== "conditional" || run.conditionalApproval !== true) throw new PatchApplicationError("not_mutation_eligible", "REJECTED");
  if (run.verificationModeAtRequest === "local" && run.verificationOutcomeAtRequest === "locally_validated" && run.conditionalApprovalKind === "local_conditional") {
    if (verification.verificationMode === "local" && verification.planRequested === false && verification.stages.plan.status === "not_run" && verification.outcome === "locally_validated" && verification.applySafety === "conditionally_eligible") return;
    throw new PatchApplicationError("conditional_verification_changed", "FAILED");
  }
  if (verification.outcome === "semantic_failure") throw new PatchApplicationError("fresh_verification_semantic_failure", "FAILED");
  if (verification.outcome === "unknown_failure") throw new PatchApplicationError("fresh_verification_unknown_failure", "FAILED");
  if (verification.outcome === "patch_invalid") throw new PatchApplicationError("fresh_verification_patch_invalid", "FAILED");
  if (
    verification.outcome !== "environment_blocked"
    || verification.applySafety !== "conditionally_eligible"
    || !verification.planFailure
    || !isEnvironmentalPlanFailureClass(verification.planFailure.classification)
    || verification.planFailure.classification !== run.planFailureClassAtRequest
    || verification.planFailure.reasonCode !== run.planFailureReasonCodeAtRequest
  ) throw new PatchApplicationError("conditional_verification_changed", "FAILED");
}

async function classifyPlanFailureWithAgent(result: CommandResult, input: { workspaceRoot: string; command: typeof runCommand; signal: AbortSignal }): Promise<PlanFailureView> {
  const payloadPath = path.join(input.workspaceRoot, "fresh-plan-diagnostic.json");
  await writeFile(payloadPath, JSON.stringify({
    command: ["terraform", "plan"], status: "failed", exit_code: result.exitCode,
    stdout: result.stdout, stderr: result.stderr, duration_seconds: 0,
  }), { encoding: "utf8", mode: 0o600 });
  const script = [
    "import json, sys",
    "from semantic_terraform_agent.models import VerificationCommand",
    "from semantic_terraform_agent.terraform.plan_diagnostics import classify_plan_failure",
    "data=json.load(open(sys.argv[1], encoding='utf-8'))",
    "print(classify_plan_failure(VerificationCommand.model_validate(data)).model_dump_json())",
  ].join("; ");
  const classified = await input.command("python3", ["-c", script, payloadPath], { env: safeEnvironment(), timeoutMs: 30_000, signal: input.signal });
  if (classified.exitCode !== 0 || classified.timedOut) throw new PatchApplicationError("fresh_verification_unknown_failure", "FAILED");
  try {
    const value = JSON.parse(classified.stdout) as Record<string, unknown>;
    const classification = typeof value.classification === "string" ? value.classification : null;
    const reasonCode = typeof value.reason_code === "string" ? value.reason_code : null;
    const summary = typeof value.summary === "string" ? value.summary : null;
    const detail = typeof value.detail === "string" ? value.detail : null;
    const diagnosticFormat = value.diagnostic_format === "terraform_json" || value.diagnostic_format === "bounded_text" ? value.diagnostic_format : null;
    if (!classification || !reasonCode || !summary || !detail || !diagnosticFormat || !["terraform_semantic", "credentials", "permissions", "network", "provider_unavailable", "external_service", "runtime_environment", "unknown"].includes(classification)) throw new Error("invalid classifier result");
    return {
      classification: classification as PlanFailureView["classification"], reasonCode, summary, detail,
      sourceFile: typeof value.source_file === "string" ? value.source_file : null,
      sourceLine: typeof value.source_line === "number" && Number.isInteger(value.source_line) && value.source_line > 0 ? value.source_line : null,
      resourceAddress: typeof value.resource_address === "string" ? value.resource_address : null,
      diagnosticFormat,
    };
  } catch (error) {
    throw new PatchApplicationError("fresh_verification_unknown_failure", "FAILED", { cause: error });
  }
}

function safeEnvironment(): NodeJS.ProcessEnv {
  return { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG ?? "C.UTF-8", GIT_TERMINAL_PROMPT: "0" };
}

function gitAuthEnvironment(token: string): NodeJS.ProcessEnv {
  const basic = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64");
  return { ...safeEnvironment(), GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}` };
}

function terraformEnvironment(credentials: TemporaryAwsCredentials | null, dataDir: string): NodeJS.ProcessEnv {
  const environment = { ...safeEnvironment(), TF_IN_AUTOMATION: "1", TF_DATA_DIR: dataDir };
  if (!credentials) return environment;
  return { ...environment, AWS_ACCESS_KEY_ID: credentials.accessKeyId, AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey, AWS_SESSION_TOKEN: credentials.sessionToken, AWS_REGION: credentials.region, AWS_DEFAULT_REGION: credentials.region };
}

export function applicationCommitFingerprint(runId: string, patchSha256: string) {
  return createHash("sha256").update(`${runId}\0${patchSha256}`).digest("hex");
}
