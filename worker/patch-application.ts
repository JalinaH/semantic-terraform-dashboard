import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ClaimedPatchApplication } from "@/lib/data/patch-applications";
import { PatchApplicationError } from "@/lib/patch-application/errors";
import { hashVerifiedPatch, validatePullRequestPreflight, validateTerraformAffectedFiles } from "@/lib/patch-application/eligibility";
import type { FreshVerificationSummary, PatchApplicationStage, PullRequestHeadSnapshot } from "@/lib/patch-application/types";
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
}

export async function processClaimedPatchApplication(run: ClaimedPatchApplication, dependencies: PatchApplicationDependencies, options: { timeoutMs?: number; onProgress?(stage: PatchApplicationStage): void } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? APPLICATION_TIMEOUT_MS);
  timer.unref();
  const command = dependencies.commands ?? runCommand;
  let workspaceRoot: string | null = null;
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
    const verification = emptyVerification();
    verification.patch_check = await runStage(command, "git", ["apply", "--check", "--", patchPath], checkoutPath, safeEnvironment(), controller.signal);
    await dependencies.store.recordFreshVerification(run.id, verification);
    if (verification.patch_check.status !== "passed") throw new PatchApplicationError("patch_check_failed", "REJECTED");

    await progress("applying_patch");
    verification.patch_apply = await runStage(command, "git", ["apply", "--", patchPath], checkoutPath, safeEnvironment(), controller.signal);
    await dependencies.store.recordFreshVerification(run.id, verification);
    if (verification.patch_apply.status !== "passed") throw new PatchApplicationError("patch_check_failed", "REJECTED");
    await progress("verifying_files");
    await verifyChangedFiles(run, checkoutPath, command, controller.signal);

    await progress("fresh_verification");
    const credentials = await dependencies.aws.assume(run, controller.signal);
    await verifyTerraformVersion(run.terraformVersion, command, controller.signal);
    const terraformCwd = path.resolve(checkoutPath, run.terraformDir);
    const environment = terraformEnvironment(credentials, terraformDataPath);
    const terraformStages = [
      ["fmt", ["fmt", "-check"]],
      ["init", ["init", "-backend=false", "-input=false", "-no-color"]],
      ["validate", ["validate", "-no-color"]],
      ["plan", ["plan", "-input=false", "-lock=false", "-refresh=false", "-no-color"]],
    ] as const;
    for (const [stage, args] of terraformStages) {
      verification[stage] = await runStage(command, "terraform", [...args], terraformCwd, environment, controller.signal);
      await dependencies.store.recordFreshVerification(run.id, verification);
      if (verification[stage].status !== "passed") throw new PatchApplicationError("fresh_verification_failed", "FAILED");
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
  if (!run.repositoryAccessible || !run.installationActive || !run.aws?.connected) throw new PatchApplicationError("installation_unavailable", "REJECTED");
  if (run.expectedHeadSha !== run.verifiedAgainstCommitSha) throw new PatchApplicationError("source_revision_mismatch", "REJECTED");
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
  return { status: result.exitCode === 0 && !result.timedOut ? "passed" as const : "failed" as const, durationMs: Date.now() - started };
}

async function requireCommand(command: typeof runCommand, executable: string, args: string[], cwd: string | undefined, env: NodeJS.ProcessEnv, signal: AbortSignal, code: PatchApplicationError["code"]): Promise<CommandResult> {
  const result = await command(executable, args, { cwd, env, timeoutMs: 120_000, signal });
  if (result.exitCode !== 0 || result.timedOut) throw new PatchApplicationError(code, code === "stale_pull_request" ? "STALE" : "FAILED");
  return result;
}

function emptyVerification(): FreshVerificationSummary {
  return Object.fromEntries(["patch_check", "patch_apply", "fmt", "init", "validate", "plan"].map((stage) => [stage, { status: "not_run", durationMs: null }])) as FreshVerificationSummary;
}

function safeEnvironment(): NodeJS.ProcessEnv {
  return { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG ?? "C.UTF-8", GIT_TERMINAL_PROMPT: "0" };
}

function gitAuthEnvironment(token: string): NodeJS.ProcessEnv {
  const basic = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64");
  return { ...safeEnvironment(), GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}` };
}

function terraformEnvironment(credentials: TemporaryAwsCredentials, dataDir: string): NodeJS.ProcessEnv {
  return { ...safeEnvironment(), TF_IN_AUTOMATION: "1", TF_DATA_DIR: dataDir, AWS_ACCESS_KEY_ID: credentials.accessKeyId, AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey, AWS_SESSION_TOKEN: credentials.sessionToken, AWS_REGION: credentials.region, AWS_DEFAULT_REGION: credentials.region };
}

export function applicationCommitFingerprint(runId: string, patchSha256: string) {
  return createHash("sha256").update(`${runId}\0${patchSha256}`).digest("hex");
}
