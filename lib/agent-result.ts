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

const planFailureSchema = z.object({
  classification: z.enum(["terraform_semantic", "credentials", "permissions", "network", "provider_unavailable", "external_service", "runtime_environment", "unknown"]),
  reason_code: z.string().min(1).max(100),
  summary: z.string().min(1).max(500),
  detail: z.string().min(1).max(2_000),
  source_file: z.string().max(512).nullable().optional(),
  source_line: z.number().int().positive().nullable().optional(),
  resource_address: z.string().max(512).nullable().optional(),
  diagnostic_format: z.enum(["terraform_json", "bounded_text"]),
});

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
  candidate_source: z.enum(["llm", "verified_failure_memory"]).optional(),
  failure_category: z.string().max(100).nullable().optional(),
  failure_reason_code: z.string().max(100).nullable().optional(),
  failure_description: z.string().max(500).nullable().optional(),
  candidate_representation: z.enum(["structured_edit", "legacy_diff"]).nullable().optional(),
  patch_construction_strategy: z.string().max(80).nullable().optional(),
  plan_failure: planFailureSchema.nullable().optional(),
}).passthrough();

const candidateSchema = z.object({
  root_cause: z.string().min(1).max(20_000),
  affected_resources: z.array(z.string().max(500)).max(100),
  violated_constraint: z.string().min(1).max(10_000),
  suggested_patch: z.string().min(1).max(250_000),
  model_confidence: z.number().min(0).max(1),
}).passthrough();

const nullableCount = z.number().int().nonnegative().nullable().optional();
const nullableRatio = z.number().min(0).max(1).nullable().optional();

const llmCallSchema = z.object({
  provider: z.string().max(100),
  requested_model: z.string().max(500),
  reported_model: z.string().max(500).nullable().optional(),
  upstream_provider: z.string().max(500).nullable().optional(),
  input_tokens: nullableCount,
  cached_input_tokens: nullableCount,
  output_tokens: nullableCount,
  reasoning_tokens: nullableCount,
  total_tokens: nullableCount,
  cost_usd: z.number().nonnegative().nullable().optional(),
  latency_ms: z.number().int().nonnegative(),
  cache_hit: z.boolean().nullable().optional(),
  call_type: z.string().max(100),
  context_level: z.string().max(100).nullable().optional(),
  routing_tier: z.string().max(100).nullable().optional(),
  routing_reason: z.string().max(500).nullable().optional(),
  call_number: z.number().int().min(1).max(100).nullable().optional(),
}).passthrough();

const llmUsageSchema = z.object({
  call_count: z.number().int().nonnegative(),
  input_tokens: nullableCount,
  cached_input_tokens: nullableCount,
  output_tokens: nullableCount,
  reasoning_tokens: nullableCount,
  total_tokens: nullableCount,
  cost_usd: z.number().nonnegative().nullable().optional(),
  latency_ms: nullableCount,
  token_counts_complete: z.boolean().optional(),
  cost_complete: z.boolean().optional(),
}).passthrough();

const contextOptimizationSchema = z.object({
  available_source_characters: nullableCount,
  selected_source_characters: nullableCount,
  reduction_ratio: nullableRatio,
  character_reduction_ratio: nullableRatio,
}).passthrough();

const contextSectionTelemetrySchema = z.object({
  characters: z.number().int().nonnegative(),
  full_available_characters: nullableCount,
  selected_schema_characters: nullableCount,
  reduction_ratio: nullableRatio,
}).passthrough();

const contextTelemetrySchema = z.object({
  mode: z.enum(["lightweight", "schema-aware", "progressive"]),
  prompt_characters: z.number().int().nonnegative(),
  system_prompt_characters: z.number().int().nonnegative(),
  user_prompt_characters: z.number().int().nonnegative(),
  resource_schema_included: z.boolean(),
  git_diff_included: z.boolean(),
  source_file_count: z.number().int().nonnegative(),
  source_block_count: z.number().int().nonnegative().optional(),
  changed_line_count: z.number().int().nonnegative().optional(),
  referenced_symbol_count: z.number().int().nonnegative().optional(),
  schema_included: z.boolean().optional(),
  selected_context_characters: nullableCount,
  rendered_user_prompt_characters: nullableCount,
  sections: z.record(z.string().max(100), contextSectionTelemetrySchema).refine((value) => Object.keys(value).length <= 30),
}).passthrough();

const schemaOptimizationSchema = z.object({
  full_schema_characters: z.number().int().nonnegative().nullable().optional(),
  selected_schema_characters: z.number().int().nonnegative().nullable().optional(),
  reduction_ratio: nullableRatio,
  character_reduction_ratio: nullableRatio,
}).passthrough();

const contextProgressionSchema = z.object({
  initial_level: z.string().max(100),
  final_level: z.string().max(100),
  escalated: z.boolean(),
  reason_code: z.string().max(500).nullable().optional(),
  reason: z.string().max(5_000).nullable().optional(),
  schema_retrieved: z.boolean(),
  schema_avoided: z.boolean().nullable().optional(),
}).passthrough();

const modelProgressionSchema = z.object({
  routing_mode: z.string().max(100),
  initial_model: z.string().max(500),
  final_model: z.string().max(500),
  initial_tier: z.string().max(100).nullable().optional(),
  final_tier: z.string().max(100).nullable().optional(),
  max_allowed_tier: z.string().max(100).nullable().optional(),
  model_escalated: z.boolean(),
}).passthrough();

const cacheComponentSchema = z.object({ status: z.string().max(100) }).passthrough();
const cacheSchema = z.object({
  failure_memory: cacheComponentSchema.extend({
    reused: z.boolean().optional(),
    fresh_verification_passed: z.boolean().nullable().optional(),
    llm_calls_avoided: z.number().int().nonnegative().optional(),
    historical_total_tokens_avoided: nullableCount,
    historical_cost_avoided_usd: z.number().nonnegative().nullable().optional(),
  }),
  provider_schema: cacheComponentSchema.optional(),
  schema_slice: cacheComponentSchema.optional(),
}).passthrough();

const gitShaSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const verifiedPatchSchema = z.object({
  patch_sha256: sha256Schema.nullable(),
  affected_files: z.array(z.string().min(1).max(1_000)).max(100),
  repository_relative_paths_only: z.boolean(),
  terraform_files_only: z.boolean(),
  existing_files_only: z.boolean(),
  verification_status: verificationStatusSchema,
  verification_passed: z.boolean(),
  verification_attempt: z.number().int().min(1).max(2),
  verified_against_commit_sha: gitShaSchema.nullable(),
  source_fingerprint_sha256: sha256Schema.nullable(),
  candidate_source: z.enum(["llm", "verified_failure_memory"]),
}).passthrough();

const sourceProvenanceSchema = z.object({
  repository_scope: z.string().max(500),
  terraform_dir: z.string().max(2_000),
  git_commit_sha: gitShaSchema.nullable(),
  git_tree_sha: gitShaSchema.nullable(),
  caller_source_revision: gitShaSchema.nullable(),
  verified_against_commit_sha: gitShaSchema.nullable(),
  working_tree_mode: z.enum(["git_clean", "git_dirty", "non_git"]),
  source_fingerprint_sha256: sha256Schema.nullable(),
}).passthrough();

const verificationProvenanceSchema = z.object({
  attempt_number: z.number().int().min(1).max(2),
  final_status: verificationStatusSchema,
  verified_in_isolated_workspace: z.boolean(),
  patch_check_passed: z.boolean(),
  patch_apply_passed: z.boolean(),
  fmt_passed: z.boolean(),
  init_passed: z.boolean(),
  validate_passed: z.boolean(),
  plan_required: z.boolean(),
  plan_attempted: z.boolean().optional(),
  plan_passed: z.boolean(),
  terraform_version: z.string().max(100).nullable(),
  provider_versions: z.record(z.string().max(500), z.string().max(100)),
}).passthrough();

const mutationEligibilitySchema = z.object({
  eligible: z.boolean(),
  eligibility_level: z.enum(["verified", "conditional", "ineligible"]).optional(),
  reason_code: z.string().min(1).max(100),
  reasons: z.array(z.string().min(1).max(100)).max(30),
  requires_fresh_head_check: z.boolean(),
}).passthrough();

const verificationAssessmentSchema = z.object({
  outcome: z.enum(["fully_verified", "environment_blocked", "semantic_failure", "patch_invalid", "unknown_failure"]),
  patch_check_passed: z.boolean(),
  patch_apply_passed: z.boolean(),
  fmt_passed: z.boolean(),
  init_passed: z.boolean(),
  validate_passed: z.boolean(),
  plan_attempted: z.boolean(),
  plan_passed: z.boolean(),
  full_verification_passed: z.boolean(),
  apply_safety: z.enum(["verified", "conditionally_eligible", "ineligible"]),
  plan_failure: planFailureSchema.nullable().optional(),
});

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
    selected_mode: z.enum(["lightweight", "schema-aware", "progressive"]),
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
  llm_usage: llmUsageSchema.optional(),
  llm_calls: z.array(llmCallSchema).max(100).optional(),
  context_optimization: contextOptimizationSchema.nullable().optional(),
  context_telemetry: contextTelemetrySchema.nullable().optional(),
  schema_optimization: schemaOptimizationSchema.nullable().optional(),
  context_progression: contextProgressionSchema.nullable().optional(),
  model_progression: modelProgressionSchema.nullable().optional(),
  cache: cacheSchema.nullable().optional(),
  resolution_source: z.string().max(100).nullable().optional(),
  candidate_source: z.string().max(100).nullable().optional(),
  verified_patch: verifiedPatchSchema.nullable().optional(),
  source_provenance: sourceProvenanceSchema.nullable().optional(),
  verification_provenance: verificationProvenanceSchema.nullable().optional(),
  verification_assessment: verificationAssessmentSchema.nullable().optional(),
  mutation_eligibility: mutationEligibilitySchema.nullable().optional(),
  agent_version: z.string().max(100).nullable().optional(),
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

export function sanitizeSuccessfulAgentResult(result: SuccessfulAgentResult, packageVersion?: string) {
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
    candidateSource: attempt.candidate_source ?? null,
    failureCategory: attempt.failure_category ?? null,
    failureReasonCode: attempt.failure_reason_code ?? null,
    failureDescription: attempt.failure_description ? redactSensitiveText(attempt.failure_description) : null,
    candidateRepresentation: attempt.candidate_representation ?? null,
    patchConstructionStrategy: attempt.patch_construction_strategy ?? null,
    planFailure: sanitizePlanFailure(attempt.plan_failure),
  }));
  const timing = Object.fromEntries(Object.entries(result.timing).map(([key, seconds]) => [key.replace(/_seconds$/, "_ms"), Math.round(seconds * 1_000)]));
  const tokenUsage = {
    inputTokens: result.llm_usage?.input_tokens ?? result.token_usage.input_tokens ?? null,
    cachedInputTokens: result.llm_usage?.cached_input_tokens ?? null,
    outputTokens: result.llm_usage?.output_tokens ?? result.token_usage.output_tokens ?? null,
    reasoningTokens: result.llm_usage?.reasoning_tokens ?? null,
    totalTokens: result.llm_usage?.total_tokens ?? result.token_usage.total_tokens ?? null,
  };
  const llmCalls = (result.llm_calls ?? []).map((call, index) => ({
    callNumber: call.call_number ?? index + 1,
    type: call.call_type,
    contextLevel: call.context_level ?? null,
    provider: call.provider,
    requestedModel: call.requested_model,
    reportedModel: call.reported_model ?? null,
    upstreamProvider: call.upstream_provider ?? null,
    routingTier: call.routing_tier ?? null,
    routingReason: call.routing_reason ?? null,
    inputTokens: call.input_tokens ?? null,
    cachedInputTokens: call.cached_input_tokens ?? null,
    outputTokens: call.output_tokens ?? null,
    reasoningTokens: call.reasoning_tokens ?? null,
    totalTokens: call.total_tokens ?? null,
    costUsd: call.cost_usd ?? null,
    latencyMs: call.latency_ms,
    cacheHit: call.cache_hit ?? null,
  }));
  const firstCall = result.llm_calls?.[0];
  const finalCall = result.llm_calls?.at(-1);
  const contextOptimization = result.context_optimization;
  const contextTelemetry = result.context_telemetry;
  const schemaOptimization = result.schema_optimization;
  const contextProgression = result.context_progression;
  const modelProgression = result.model_progression;
  const memory = result.cache?.failure_memory;
  const verifiedPatch = result.verified_patch;
  const sourceProvenance = result.source_provenance;
  const verificationProvenance = result.verification_provenance;
  const verificationAssessment = result.verification_assessment;
  const mutationEligibility = result.mutation_eligibility;
  const finalAttempt = result.diagnosis.attempts.at(-1);
  const telemetry = {
    agentVersion: normalizeAgentVersion(result.agent_version) ?? normalizeAgentVersion(packageVersion),
    llmCallCount: result.llm_usage?.call_count ?? (result.llm_calls ? result.llm_calls.length : null),
    inputTokens: tokenUsage.inputTokens,
    cachedInputTokens: tokenUsage.cachedInputTokens,
    outputTokens: tokenUsage.outputTokens,
    reasoningTokens: tokenUsage.reasoningTokens,
    totalTokens: tokenUsage.totalTokens,
    llmCostUsd: result.llm_usage?.cost_usd ?? null,
    costComplete: result.llm_usage?.cost_complete ?? null,
    tokenCountsComplete: result.llm_usage?.token_counts_complete ?? null,
    llmLatencyMs: result.llm_usage?.latency_ms ?? null,
    provider: firstCall?.provider ?? null,
    requestedModel: firstCall?.requested_model ?? null,
    reportedModel: finalCall?.reported_model ?? firstCall?.reported_model ?? null,
    upstreamProvider: finalCall?.upstream_provider ?? firstCall?.upstream_provider ?? null,
    routingMode: modelProgression?.routing_mode ?? null,
    maxModelTier: modelProgression?.max_allowed_tier ?? null,
    initialModel: modelProgression?.initial_model ?? firstCall?.requested_model ?? null,
    finalModel: modelProgression?.final_model ?? finalCall?.requested_model ?? null,
    initialModelTier: modelProgression?.initial_tier ?? firstCall?.routing_tier ?? null,
    finalModelTier: modelProgression?.final_tier ?? finalCall?.routing_tier ?? null,
    modelEscalated: modelProgression?.model_escalated ?? null,
    initialContextLevel: contextProgression?.initial_level ?? firstCall?.context_level ?? null,
    finalContextLevel: contextProgression?.final_level ?? finalCall?.context_level ?? null,
    contextEscalated: contextProgression?.escalated ?? null,
    contextEscalationReason: contextProgression?.reason ? redactSensitiveText(contextProgression.reason) : contextProgression?.reason_code ?? null,
    schemaRetrieved: contextProgression?.schema_retrieved ?? null,
    schemaAvoided: contextProgression?.schema_avoided ?? null,
    sourceCharactersAvailable: contextOptimization?.available_source_characters ?? null,
    sourceCharactersSelected: contextOptimization?.selected_source_characters ?? null,
    sourceReductionRatio: contextOptimization?.character_reduction_ratio ?? contextOptimization?.reduction_ratio ?? null,
    schemaCharactersAvailable: schemaOptimization?.full_schema_characters ?? null,
    schemaCharactersSelected: schemaOptimization?.selected_schema_characters ?? null,
    schemaReductionRatio: schemaOptimization?.character_reduction_ratio ?? schemaOptimization?.reduction_ratio ?? null,
    failureMemoryStatus: memory?.status ?? null,
    failureMemoryReused: memory?.reused ?? null,
    freshVerificationPassed: memory?.fresh_verification_passed ?? null,
    resolutionSource: result.resolution_source ?? null,
    candidateSource: result.candidate_source ?? (finalAttempt && "candidate_source" in finalAttempt && typeof finalAttempt.candidate_source === "string" ? finalAttempt.candidate_source : result.resolution_source ?? null),
    llmCallsAvoided: memory?.llm_calls_avoided ?? null,
    historicalTokensAvoided: memory?.historical_total_tokens_avoided ?? null,
    historicalCostAvoidedUsd: memory?.historical_cost_avoided_usd ?? null,
    patchSha256: verifiedPatch?.patch_sha256 ?? null,
    verifiedAgainstCommitSha: verifiedPatch?.verified_against_commit_sha ?? sourceProvenance?.verified_against_commit_sha ?? null,
    patchAffectedFiles: verifiedPatch?.affected_files ?? null,
    patchTerraformFilesOnly: verifiedPatch?.terraform_files_only ?? null,
    patchExistingFilesOnly: verifiedPatch?.existing_files_only ?? null,
    patchRepositoryRelative: verifiedPatch?.repository_relative_paths_only ?? null,
    patchSourceFingerprint: verifiedPatch?.source_fingerprint_sha256 ?? null,
    patchCandidateSource: verifiedPatch?.candidate_source ?? null,
    mutationEligible: mutationEligibility?.eligible ?? null,
    mutationEligibilityLevel: mutationEligibility?.eligibility_level ?? null,
    mutationEligibilityReason: mutationEligibility?.reason_code ?? null,
    mutationEligibilityDetails: mutationEligibility?.reasons ?? null,
    verificationOutcome: verificationAssessment?.outcome ?? null,
    assessmentPatchCheckPassed: verificationAssessment?.patch_check_passed ?? null,
    assessmentPatchApplyPassed: verificationAssessment?.patch_apply_passed ?? null,
    assessmentFmtPassed: verificationAssessment?.fmt_passed ?? null,
    assessmentInitPassed: verificationAssessment?.init_passed ?? null,
    assessmentValidatePassed: verificationAssessment?.validate_passed ?? null,
    assessmentPlanAttempted: verificationAssessment?.plan_attempted ?? null,
    assessmentPlanPassed: verificationAssessment?.plan_passed ?? null,
    assessmentFullVerificationPassed: verificationAssessment?.full_verification_passed ?? null,
    applySafety: verificationAssessment?.apply_safety ?? null,
    planFailureClass: verificationAssessment?.plan_failure?.classification ?? null,
    planFailureReasonCode: verificationAssessment?.plan_failure?.reason_code ?? null,
    planFailureSummary: verificationAssessment?.plan_failure ? redactSensitiveText(verificationAssessment.plan_failure.summary) : null,
    planFailureDetail: verificationAssessment?.plan_failure ? redactSensitiveText(verificationAssessment.plan_failure.detail) : null,
    planFailureSourceFile: verificationAssessment?.plan_failure?.source_file ?? null,
    planFailureSourceLine: verificationAssessment?.plan_failure?.source_line ?? null,
    planFailureResourceAddress: verificationAssessment?.plan_failure?.resource_address ?? null,
    planDiagnosticFormat: verificationAssessment?.plan_failure?.diagnostic_format ?? null,
  };
  const safeContextTelemetry = contextTelemetry ? {
    gitDiffIncluded: contextTelemetry.git_diff_included,
    changedLineCount: contextTelemetry.changed_line_count ?? null,
    selectedContextCharacters: contextTelemetry.selected_context_characters ?? null,
    renderedUserPromptCharacters: contextTelemetry.rendered_user_prompt_characters ?? null,
    sourceFileCount: contextTelemetry.source_file_count,
    sourceBlockCount: contextTelemetry.source_block_count ?? null,
    sections: Object.fromEntries(Object.entries(contextTelemetry.sections).map(([name, section]) => [name, section.characters])),
  } : null;
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
    llmUsage: result.llm_usage ? {
      callCount: telemetry.llmCallCount,
      costUsd: telemetry.llmCostUsd,
      costComplete: telemetry.costComplete,
      tokenCountsComplete: telemetry.tokenCountsComplete,
      latencyMs: telemetry.llmLatencyMs,
    } : null,
    llmCalls,
    contextOptimization: contextOptimization ? {
      availableSourceCharacters: telemetry.sourceCharactersAvailable,
      selectedSourceCharacters: telemetry.sourceCharactersSelected,
      reductionRatio: telemetry.sourceReductionRatio,
    } : null,
    contextTelemetry: safeContextTelemetry,
    schemaOptimization: schemaOptimization ? {
      fullSchemaCharacters: telemetry.schemaCharactersAvailable,
      selectedSchemaCharacters: telemetry.schemaCharactersSelected,
      reductionRatio: telemetry.schemaReductionRatio,
    } : null,
    contextProgression: contextProgression ? {
      initialLevel: telemetry.initialContextLevel,
      finalLevel: telemetry.finalContextLevel,
      escalated: telemetry.contextEscalated,
      reason: telemetry.contextEscalationReason ? redactSensitiveText(telemetry.contextEscalationReason) : null,
      schemaRetrieved: telemetry.schemaRetrieved,
      schemaAvoided: telemetry.schemaAvoided,
    } : null,
    modelProgression: modelProgression ? {
      routingMode: telemetry.routingMode,
      maxModelTier: telemetry.maxModelTier,
      initialModel: telemetry.initialModel,
      finalModel: telemetry.finalModel,
      initialTier: telemetry.initialModelTier,
      finalTier: telemetry.finalModelTier,
      modelEscalated: telemetry.modelEscalated,
    } : null,
    cache: result.cache ? {
      failureMemory: {
        status: telemetry.failureMemoryStatus,
        reused: telemetry.failureMemoryReused,
        freshVerificationPassed: telemetry.freshVerificationPassed,
        llmCallsAvoided: telemetry.llmCallsAvoided,
        historicalTokensAvoided: telemetry.historicalTokensAvoided,
        historicalCostAvoidedUsd: telemetry.historicalCostAvoidedUsd,
      },
      providerSchemaStatus: result.cache.provider_schema?.status ?? null,
      schemaSliceStatus: result.cache.schema_slice?.status ?? null,
    } : null,
    resolutionSource: telemetry.resolutionSource,
    candidateSource: telemetry.candidateSource,
    verifiedPatch: verifiedPatch ? {
      patchSha256: telemetry.patchSha256,
      affectedFiles: telemetry.patchAffectedFiles,
      repositoryRelativePathsOnly: telemetry.patchRepositoryRelative,
      terraformFilesOnly: telemetry.patchTerraformFilesOnly,
      existingFilesOnly: telemetry.patchExistingFilesOnly,
      verificationStatus: verifiedPatch.verification_status,
      verificationPassed: verifiedPatch.verification_passed,
      verificationAttempt: verifiedPatch.verification_attempt,
      verifiedAgainstCommitSha: telemetry.verifiedAgainstCommitSha,
      sourceFingerprintSha256: telemetry.patchSourceFingerprint,
      candidateSource: telemetry.patchCandidateSource,
    } : null,
    sourceProvenance: sourceProvenance ? {
      terraformDir: sourceProvenance.terraform_dir,
      gitCommitSha: sourceProvenance.git_commit_sha,
      gitTreeSha: sourceProvenance.git_tree_sha,
      callerSourceRevision: sourceProvenance.caller_source_revision,
      verifiedAgainstCommitSha: sourceProvenance.verified_against_commit_sha,
      workingTreeMode: sourceProvenance.working_tree_mode,
      sourceFingerprintSha256: sourceProvenance.source_fingerprint_sha256,
    } : null,
    verificationProvenance: verificationProvenance ? {
      attemptNumber: verificationProvenance.attempt_number,
      finalStatus: verificationProvenance.final_status,
      verifiedInIsolatedWorkspace: verificationProvenance.verified_in_isolated_workspace,
      patchCheckPassed: verificationProvenance.patch_check_passed,
      patchApplyPassed: verificationProvenance.patch_apply_passed,
      fmtPassed: verificationProvenance.fmt_passed,
      initPassed: verificationProvenance.init_passed,
      validatePassed: verificationProvenance.validate_passed,
      planRequired: verificationProvenance.plan_required,
      planAttempted: verificationProvenance.plan_attempted ?? null,
      planPassed: verificationProvenance.plan_passed,
      terraformVersion: verificationProvenance.terraform_version,
      providerVersions: verificationProvenance.provider_versions,
    } : null,
    verificationAssessment: verificationAssessment ? {
      outcome: telemetry.verificationOutcome,
      patchCheckPassed: telemetry.assessmentPatchCheckPassed,
      patchApplyPassed: telemetry.assessmentPatchApplyPassed,
      fmtPassed: telemetry.assessmentFmtPassed,
      initPassed: telemetry.assessmentInitPassed,
      validatePassed: telemetry.assessmentValidatePassed,
      planAttempted: telemetry.assessmentPlanAttempted,
      planPassed: telemetry.assessmentPlanPassed,
      fullVerificationPassed: telemetry.assessmentFullVerificationPassed,
      applySafety: telemetry.applySafety,
      planFailure: sanitizePlanFailure(verificationAssessment.plan_failure),
    } : null,
    mutationEligibility: mutationEligibility ? {
      eligible: mutationEligibility.eligible,
      eligibilityLevel: mutationEligibility.eligibility_level ?? null,
      reasonCode: mutationEligibility.reason_code,
      reasons: mutationEligibility.reasons,
      requiresFreshHeadCheck: mutationEligibility.requires_fresh_head_check,
    } : null,
    agentVersion: telemetry.agentVersion,
    warnings: result.warnings.slice(0, 30).map((warning) => redactSensitiveText(warning.slice(0, 500))),
  };
  return {
    rootCause,
    violatedConstraint,
    suggestedPatch,
    verifiedPatch: verifiedPatch ? result.diagnosis.final_patch : null,
    affectedResources: finalCandidate.affected_resources,
    verificationStatus: result.diagnosis.verification_status,
    modelConfidence: result.diagnosis.model_confidence,
    evidenceScore: result.diagnosis.evidence_score,
    attempts,
    timing,
    tokenUsage,
    llmCalls,
    telemetry,
    contextTelemetry: safeContextTelemetry,
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

function normalizeAgentVersion(value: string | null | undefined) {
  const match = value?.trim().match(/^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/);
  return match?.[1] ?? null;
}

export function redactSensitiveText(value: string) {
  return value
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]")
    .replace(/\b(?:github_pat_|gh[opsu]_)[A-Za-z0-9_]{16,}\b/g, "[REDACTED]")
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]")
    .replace(/\b(AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|GEMINI_API_KEY|OPENROUTER_API_KEY|GITHUB_TOKEN)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
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

function sanitizePlanFailure(value: z.infer<typeof planFailureSchema> | null | undefined) {
  return value ? {
    classification: value.classification,
    reasonCode: value.reason_code,
    summary: redactSensitiveText(value.summary),
    detail: redactSensitiveText(value.detail),
    sourceFile: value.source_file ?? null,
    sourceLine: value.source_line ?? null,
    resourceAddress: value.resource_address ?? null,
    diagnosticFormat: value.diagnostic_format,
  } : null;
}
