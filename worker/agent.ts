import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getWorkerConfiguration } from "@/lib/config";
import { WorkerExecutionError } from "@/lib/worker/errors";
import type { ClaimedAgentRun, PreparedAgentWorkspace, TemporaryAwsCredentials } from "@/lib/worker/types";
import { runCommand } from "@/worker/command";

const MAX_RESULT_BYTES = 2 * 1024 * 1024;
const AWS_TERRAFORM_PASSTHROUGH = [
  "AWS_ACCESS_KEY_ID",
  "AWS_DEFAULT_REGION",
  "AWS_REGION",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
].join(",");

export async function invokeSemanticTerraformAgent(input: {
  run: ClaimedAgentRun;
  workspace: PreparedAgentWorkspace;
  awsCredentials: TemporaryAwsCredentials | null;
  signal?: AbortSignal;
}) {
  const configuration = getWorkerConfiguration();
  const outputPath = path.join(path.dirname(input.workspace.failureLogPath), "result.json");
  const registryPath = input.run.config.modelRouting === "auto" ? path.join(path.dirname(outputPath), "model-registry.json") : undefined;
  if (registryPath) {
    if (!input.run.config.modelRegistry.length) throw new WorkerExecutionError("model_unavailable");
    await writeFile(registryPath, `${JSON.stringify({ models: input.run.config.modelRegistry }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }
  const args = buildAgentArguments(input, outputPath, registryPath);
  await verifyTerraformRuntime(input.run.config.terraformVersion, input.signal);
  let result;
  try {
    result = await runCommand(configuration.agentCommand, args, {
      cwd: input.workspace.checkoutPath,
      env: createAgentEnvironment(input.awsCredentials),
      timeoutMs: configuration.jobTimeoutSeconds * 1_000,
      signal: input.signal,
    });
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") throw new WorkerExecutionError("agent_execution_failed", { cause: error });
    throw new WorkerExecutionError("worker_internal_error", { cause: error });
  }
  if (result.timedOut) throw new WorkerExecutionError("execution_timeout");

  let serialized: string;
  try {
    serialized = await readFile(outputPath, "utf8");
  } catch (error) {
    throw new WorkerExecutionError("agent_execution_failed", { cause: error });
  }
  if (Buffer.byteLength(serialized) > MAX_RESULT_BYTES) throw new WorkerExecutionError("agent_result_invalid");
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new WorkerExecutionError("agent_result_invalid", { cause: error });
  }
  if (result.exitCode !== 0) {
    throw new WorkerExecutionError(classifyAgentFailure(parsed));
  }
  return parsed;
}

export function buildAgentArguments(input: {
  run: ClaimedAgentRun;
  workspace: PreparedAgentWorkspace;
}, outputPath: string, registryPath?: string) {
  const args = [
    "diagnose",
    "--repo-path", input.workspace.checkoutPath,
    "--terraform-dir", input.run.config.terraformDir,
    "--log-file", input.workspace.failureLogPath,
    "--diff-file", input.workspace.diffPath,
    "--failed-stage", input.workspace.failedStage,
    "--provider", input.run.config.modelProvider,
    "--model-routing", input.run.config.modelRouting,
    "--max-model-tier", input.run.config.maxModelTier,
    "--context-mode", input.run.config.contextMode,
    "--verify-patch",
    "--verification-mode", verificationModeForRun(input.run),
    "--max-repair-attempts", String(input.run.config.maxRepairAttempts),
    "--output", outputPath,
  ];
  if (input.run.pullRequestNumber !== null) args.push("--source-revision", input.run.commitSha);
  if (input.run.config.modelRouting === "auto") {
    if (!registryPath) throw new WorkerExecutionError("model_unavailable");
    args.push("--model-registry", registryPath);
  } else {
    args.push("--model", input.run.config.fixedModelId ?? input.run.config.model);
  }
  return args;
}

export function verificationModeForRun(run: ClaimedAgentRun): "local" | "full" {
  return run.aws?.connected ? "full" : "local";
}

export function createAgentEnvironment(credentials: TemporaryAwsCredentials | null): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,
    LANG: process.env.LANG ?? "C.UTF-8",
    LC_ALL: process.env.LC_ALL,
    SSL_CERT_FILE: process.env.SSL_CERT_FILE,
    REQUESTS_CA_BUNDLE: process.env.REQUESTS_CA_BUNDLE,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    HTTP_PROXY: process.env.HTTP_PROXY,
    NO_PROXY: process.env.NO_PROXY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  };
  if (!credentials) return environment;
  return {
    ...environment,
    SEMANTIC_TERRAFORM_AGENT_PASSTHROUGH_ENV: AWS_TERRAFORM_PASSTHROUGH,
    AWS_ACCESS_KEY_ID: credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    AWS_SESSION_TOKEN: credentials.sessionToken,
    AWS_REGION: credentials.region,
    AWS_DEFAULT_REGION: credentials.region,
  };
}

async function verifyTerraformRuntime(expectedVersion: string, signal?: AbortSignal) {
  let result;
  try {
    result = await runCommand("terraform", ["version", "-json"], {
      env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH },
      timeoutMs: 10_000,
      signal,
    });
  } catch (error) {
    throw new WorkerExecutionError("terraform_not_found", { cause: error });
  }
  if (result.timedOut || result.exitCode !== 0) throw new WorkerExecutionError("terraform_not_found");
  let installedVersion: unknown;
  try {
    const parsed: unknown = JSON.parse(result.stdout);
    installedVersion = parsed && typeof parsed === "object" ? Reflect.get(parsed, "terraform_version") : undefined;
  } catch (error) {
    throw new WorkerExecutionError("terraform_not_found", { cause: error });
  }
  validateTerraformRuntimeVersion(expectedVersion, installedVersion);
}

export function validateTerraformRuntimeVersion(expectedVersion: string, installedVersion: unknown) {
  if (installedVersion !== expectedVersion) throw new WorkerExecutionError("terraform_version_unavailable");
}

function getResultError(value: unknown) {
  if (!value || typeof value !== "object" || !("error" in value)) return "";
  return typeof Reflect.get(value, "error") === "string" ? String(Reflect.get(value, "error")) : "";
}

const PROVIDER_FAILURE_CODES = {
  authentication_failed: "model_authentication_failed",
  model_not_found: "model_not_found",
  model_unavailable: "model_unavailable",
  network_error: "model_network_error",
  provider_unavailable: "model_unavailable",
  quota_exceeded: "model_quota_exceeded",
  rate_limited: "model_rate_limited",
  response_invalid: "model_response_invalid",
  structured_output_unsupported: "model_capability_unsupported",
  timeout: "model_timeout",
} as const;

const ROUTING_FAILURE_CODES = new Set([
  "explicit_model_disabled",
  "explicit_model_not_registered",
  "invalid_model_registry",
  "model_capability_unsupported",
  "model_tier_violation",
  "no_eligible_model",
]);

export function classifyAgentFailure(value: unknown) {
  const providerCode = getStringField(value, "error_code");
  if (providerCode && providerCode in PROVIDER_FAILURE_CODES) {
    return PROVIDER_FAILURE_CODES[providerCode as keyof typeof PROVIDER_FAILURE_CODES];
  }
  const routingCode = getStringField(value, "routing_error_code");
  if (routingCode && ROUTING_FAILURE_CODES.has(routingCode)) return "model_policy_invalid";

  const safeError = getResultError(value);
  if (/source revision.*(?:does not match|could not be verified)/i.test(safeError)) return "source_revision_mismatch";
  if (/terraform.*(?:not found|unavailable)|no such file.*terraform/i.test(safeError)) return "terraform_not_found";
  if (safeError) return "agent_input_invalid";
  return "agent_execution_failed";
}

function getStringField(value: unknown, field: string) {
  if (!value || typeof value !== "object" || !(field in value)) return undefined;
  const fieldValue = Reflect.get(value, field);
  return typeof fieldValue === "string" ? fieldValue : undefined;
}

function getErrorCode(value: unknown) {
  if (!value || typeof value !== "object" || !("code" in value)) return undefined;
  return typeof Reflect.get(value, "code") === "string" ? Reflect.get(value, "code") : undefined;
}
