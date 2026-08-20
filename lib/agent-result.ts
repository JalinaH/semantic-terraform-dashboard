import { z } from "zod";

const verificationStatusSchema = z.enum([
  "verified_first_attempt",
  "verified_after_retry",
  "verification_failed",
  "patch_rejected",
  "verification_unavailable",
  "verification_skipped",
]);

const commandSchema = z.object({
  command: z.array(z.string()).max(16),
  status: z.enum(["passed", "failed", "skipped", "error"]),
  exit_code: z.number().int().nullable().optional(),
  duration_seconds: z.number().nonnegative().default(0),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
}).passthrough();

const commandsSchema = z.object({
  patch_check: commandSchema.nullable().optional(),
  patch_apply: commandSchema.nullable().optional(),
  fmt: commandSchema.nullable().optional(),
  init: commandSchema.nullable().optional(),
  validate: commandSchema.nullable().optional(),
  plan: commandSchema.nullable().optional(),
}).passthrough();

const attemptSchema = z.object({
  attempt: z.number().int().min(1).max(2),
  patch: z.string().max(250_000),
  status: z.enum(["verified", "failed", "rejected", "unavailable", "skipped"]),
  failed_stage: z.enum(["patch_check", "patch_apply", "fmt", "init", "validate", "plan"]).nullable().optional(),
  isolation: z.literal("temporary-copy"),
  changed_files: z.array(z.string()).max(100).default([]),
  commands: commandsSchema,
  temporary_copy_cleaned: z.boolean(),
  warnings: z.array(z.string()).max(30).default([]),
}).passthrough();

const candidateSchema = z.object({
  root_cause: z.string().min(1).max(20_000),
  affected_resources: z.array(z.string().max(500)).max(100),
  violated_constraint: z.string().min(1).max(10_000),
  suggested_patch: z.string().min(1).max(250_000),
  model_confidence: z.number().min(0).max(1),
}).passthrough();

const successfulResultSchema = z.object({
  status: z.literal("ok"),
  repository: z.object({
    terraform_dir: z.string(),
    terraform_files: z.array(z.string()),
    changed_terraform_files: z.array(z.string()),
    diff_source: z.string(),
    diff_comparison: z.string().nullable().optional(),
  }).passthrough(),
  terraform: z.object({
    version: z.string().nullable().optional(),
    schema_extraction_status: z.string(),
  }).passthrough(),
  failure: z.object({
    summary: z.string().max(20_000),
    detail: z.string().max(40_000),
    stage: z.enum(["init", "fmt", "validate", "plan", "apply", "unknown"]),
    resource_address: z.string().nullable().optional(),
  }).passthrough(),
  context: z.object({
    requested_mode: z.enum(["lightweight", "schema-aware", "auto"]),
    selected_mode: z.enum(["lightweight", "schema-aware"]),
    selection_reason: z.string().max(5_000),
  }),
  diagnosis: z.object({
    initial: candidateSchema,
    repair: candidateSchema.nullable().optional(),
    attempts: z.array(attemptSchema).min(1).max(2),
    final_patch: z.string().max(250_000),
    verification_status: verificationStatusSchema,
    model_confidence: z.number().min(0).max(1),
    evidence_score: z.number().min(0).max(1),
    verification: z.object({
      passed: z.boolean(),
      status: verificationStatusSchema,
      failed_stage: z.enum(["patch_check", "patch_apply", "fmt", "init", "validate", "plan"]).nullable().optional(),
      reason: z.string().max(10_000).nullable().optional(),
    }),
  }),
  timing: z.record(z.string(), z.number().nonnegative()),
  token_usage: z.object({
    input_tokens: z.number().int().nonnegative().nullable().optional(),
    output_tokens: z.number().int().nonnegative().nullable().optional(),
    total_tokens: z.number().int().nonnegative().nullable().optional(),
  }),
  warnings: z.array(z.string()).max(100).default([]),
}).passthrough();

const errorResultSchema = z.object({
  status: z.literal("error"),
  error: z.string().optional(),
}).passthrough();

export const agentResultSchema = z.discriminatedUnion("status", [successfulResultSchema, errorResultSchema]);

export type ParsedAgentResult = z.infer<typeof agentResultSchema>;
export type SuccessfulAgentResult = z.infer<typeof successfulResultSchema>;

export function parseAgentResult(input: unknown) {
  return agentResultSchema.safeParse(input);
}

export function sanitizeSuccessfulAgentResult(result: SuccessfulAgentResult) {
  const finalCandidate = result.diagnosis.repair ?? result.diagnosis.initial;
  const rootCause = redactSensitiveText(finalCandidate.root_cause);
  const violatedConstraint = redactSensitiveText(finalCandidate.violated_constraint);
  const suggestedPatch = redactSensitiveText(result.diagnosis.final_patch);
  const attempts = result.diagnosis.attempts.map((attempt) => ({
    attempt: attempt.attempt,
    status: attempt.status,
    failedStage: attempt.failed_stage ?? null,
    changedFiles: attempt.changed_files.slice(0, 100),
    temporaryCopyCleaned: attempt.temporary_copy_cleaned,
    warnings: attempt.warnings.slice(0, 20).map((warning) => redactSensitiveText(warning.slice(0, 500))),
    commands: sanitizeCommands(attempt.commands),
  }));
  const timing = Object.fromEntries(Object.entries(result.timing).map(([key, seconds]) => [key.replace(/_seconds$/, "_ms"), Math.round(seconds * 1_000)]));
  const tokenUsage = {
    inputTokens: result.token_usage.input_tokens ?? null,
    outputTokens: result.token_usage.output_tokens ?? null,
    totalTokens: result.token_usage.total_tokens ?? null,
  };
  const safeResultPayload = {
    status: "ok",
    repository: {
      terraformDir: result.repository.terraform_dir,
      changedTerraformFiles: result.repository.changed_terraform_files.slice(0, 100),
      diffSource: result.repository.diff_source,
      diffComparison: result.repository.diff_comparison ?? null,
    },
    terraform: {
      version: result.terraform.version ?? null,
      schemaExtractionStatus: result.terraform.schema_extraction_status,
    },
    failure: {
      summary: redactSensitiveText(result.failure.summary),
      detail: redactSensitiveText(result.failure.detail),
      stage: result.failure.stage,
      resourceAddress: result.failure.resource_address ?? null,
    },
    context: {
      requestedMode: result.context.requested_mode,
      selectedMode: result.context.selected_mode,
      selectionReason: redactSensitiveText(result.context.selection_reason),
    },
    diagnosis: {
      rootCause,
      affectedResources: finalCandidate.affected_resources,
      violatedConstraint,
      suggestedPatch,
      verificationStatus: result.diagnosis.verification_status,
      modelConfidence: result.diagnosis.model_confidence,
      evidenceScore: result.diagnosis.evidence_score,
      attempts,
    },
    timing,
    tokenUsage,
    warnings: result.warnings.slice(0, 30).map((warning) => redactSensitiveText(warning.slice(0, 500))),
  };
  return {
    rootCause,
    violatedConstraint,
    suggestedPatch,
    affectedResources: finalCandidate.affected_resources,
    verificationStatus: result.diagnosis.verification_status,
    modelConfidence: result.diagnosis.model_confidence,
    evidenceScore: result.diagnosis.evidence_score,
    attempts,
    timing,
    tokenUsage,
    verificationDetails: {
      ...result.diagnosis.verification,
      reason: result.diagnosis.verification.reason ? redactSensitiveText(result.diagnosis.verification.reason) : null,
    },
    safeResultPayload,
    totalRuntimeMs: timing.total_ms ?? null,
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
  };
}

export function redactSensitiveText(value: string) {
  return value
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]")
    .replace(/\b(?:github_pat_|gh[opsu]_)[A-Za-z0-9_]{16,}\b/g, "[REDACTED]")
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]")
    .replace(/\b(AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|GEMINI_API_KEY|GITHUB_TOKEN)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "Bearer [REDACTED]")
    .replace(/x-access-token:[^@\s]+/gi, "x-access-token:[REDACTED]");
}

function sanitizeCommands(commands: z.infer<typeof commandsSchema>) {
  const stages = ["patch_check", "patch_apply", "fmt", "init", "validate", "plan"] as const;
  return Object.fromEntries(stages.flatMap((stage) => {
    const command = commands[stage];
    return command ? [[stage, {
      command: command.command.slice(0, 16),
      status: command.status,
      exitCode: command.exit_code ?? null,
      durationMs: Math.round(command.duration_seconds * 1_000),
    }]] : [];
  }));
}
