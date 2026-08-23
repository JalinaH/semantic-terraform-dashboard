import { describe, expect, it } from "vitest";
import { parseAgentResult, sanitizeSuccessfulAgentResult } from "@/lib/agent-result";
import { validAgentResult } from "@/tests/phase5-fixtures";
import { v1AgentResult } from "@/tests/phase7-fixtures";

function sanitize(input: unknown) {
  const parsed = parseAgentResult(input);
  expect(parsed.success).toBe(true);
  if (!parsed.success || parsed.data.status !== "ok") throw new Error("Expected successful result");
  return sanitizeSuccessfulAgentResult(parsed.data);
}

describe("agent v1.0 telemetry mapping", () => {
  it("normalizes aggregate calls, routing, progression, reductions, and agent version", () => {
    const result = sanitize(v1AgentResult());
    expect(result.telemetry).toMatchObject({
      agentVersion: "1.0.0", llmCallCount: 2, inputTokens: 3700, cachedInputTokens: 1100,
      outputTokens: 420, reasoningTokens: 90, totalTokens: 4120, llmCostUsd: 0.00252,
      costComplete: true, provider: "openrouter", requestedModel: "openrouter/free",
      reportedModel: "provider/economy-model", upstreamProvider: "Provider",
      initialModelTier: "free", finalModelTier: "economy", modelEscalated: true,
      initialContextLevel: "minimal", finalContextLevel: "schema", contextEscalated: true,
      schemaRetrieved: true, schemaAvoided: false, sourceCharactersAvailable: 18200,
      sourceCharactersSelected: 3100, schemaCharactersAvailable: 26000,
      schemaCharactersSelected: 2100, failureMemoryStatus: "miss", failureMemoryReused: false,
    });
    expect(result.llmCalls).toHaveLength(2);
    expect(result.contextTelemetry).toMatchObject({
      gitDiffIncluded: true,
      changedLineCount: 2,
      selectedContextCharacters: 3912,
      renderedUserPromptCharacters: 3140,
      sections: { terraform_error: 420, git_diff: 318, terraform_source: 2400, supporting_context: 700, provider_schema: 2100 },
    });
    expect(result.safeResultPayload).toHaveProperty("contextTelemetry.gitDiffIncluded", true);
    expect(result.safeResultPayload).not.toHaveProperty("repository.terraformFiles");
    expect(JSON.stringify(result.safeResultPayload)).not.toContain("prompt_characters");
  });

  it("preserves explicit zero selected source while keeping diff evidence separate", () => {
    const result = sanitize(v1AgentResult({
      context_optimization: { available_source_characters: 1639, selected_source_characters: 0, character_reduction_ratio: 1 },
      context_telemetry: {
        mode: "lightweight", prompt_characters: 900, system_prompt_characters: 300, user_prompt_characters: 600,
        resource_schema_included: false, git_diff_included: true, source_file_count: 1, source_block_count: 0,
        changed_line_count: 2, referenced_symbol_count: 0, schema_included: false,
        selected_context_characters: 510, rendered_user_prompt_characters: 600,
        sections: { terraform_error: { characters: 192 }, git_diff: { characters: 318 }, terraform_source: { characters: 0 }, supporting_context: { characters: 0 }, provider_schema: { characters: 0 } },
        calls: [],
      },
    }));
    expect(result.telemetry.sourceCharactersSelected).toBe(0);
    expect(result.telemetry.sourceReductionRatio).toBe(1);
    expect(result.contextTelemetry).toMatchObject({ gitDiffIncluded: true, changedLineCount: 2, sections: { git_diff: 318, terraform_source: 0 } });
  });

  it("keeps missing selected source and section telemetry unknown", () => {
    const result = sanitize(v1AgentResult({
      context_optimization: { available_source_characters: 1639 },
      context_telemetry: null,
    }));
    expect(result.telemetry.sourceCharactersSelected).toBeNull();
    expect(result.telemetry.sourceReductionRatio).toBeNull();
    expect(result.contextTelemetry).toBeNull();
  });

  it("distinguishes explicit zero cost from unknown cost", () => {
    const free = sanitize(v1AgentResult({ llm_usage: { call_count: 1, input_tokens: 10, output_tokens: 5, total_tokens: 15, cost_usd: 0, latency_ms: 20, token_counts_complete: true, cost_complete: true }, llm_calls: [] }));
    const unknown = sanitize(v1AgentResult({ llm_usage: { call_count: 1, input_tokens: 10, output_tokens: 5, total_tokens: 15, cost_usd: null, latency_ms: 20, token_counts_complete: true, cost_complete: false }, llm_calls: [] }));
    expect(free.telemetry.llmCostUsd).toBe(0);
    expect(free.telemetry.costComplete).toBe(true);
    expect(unknown.telemetry.llmCostUsd).toBeNull();
    expect(unknown.telemetry.costComplete).toBe(false);
  });

  it("maps a verified-memory resolution as zero LLM calls with fresh verification", () => {
    const source = v1AgentResult({
      llm_usage: { call_count: 0, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_tokens: 0, total_tokens: 0, cost_usd: 0, latency_ms: 0, token_counts_complete: true, cost_complete: true },
      llm_calls: [], model_progression: null, resolution_source: "verified_failure_memory",
      cache: { failure_memory: { status: "hit_verified", format_version: "1", reused: true, fresh_verification_passed: true, llm_calls_avoided: 1, historical_total_tokens_avoided: 2184, historical_cost_avoided_usd: 0.0014 }, provider_schema: { status: "hit", format_version: "1" }, schema_slice: { status: "hit", format_version: "1" } },
    });
    const diagnosis = (source.diagnosis as { attempts: Array<Record<string, unknown>> });
    diagnosis.attempts[0].candidate_source = "verified_failure_memory";
    const result = sanitize(source);
    expect(result.telemetry).toMatchObject({ llmCallCount: 0, llmCostUsd: 0, resolutionSource: "verified_failure_memory", candidateSource: "verified_failure_memory", failureMemoryReused: true, freshVerificationPassed: true, llmCallsAvoided: 1, historicalTokensAvoided: 2184, historicalCostAvoidedUsd: 0.0014 });
  });

  it("keeps historical pre-v1 results valid with nullable telemetry", () => {
    const result = sanitize(validAgentResult());
    expect(result.inputTokens).toBe(1200);
    expect(result.telemetry.llmCallCount).toBeNull();
    expect(result.telemetry.llmCostUsd).toBeNull();
    expect(result.telemetry.modelEscalated).toBeNull();
    expect(result.llmCalls).toEqual([]);
  });
});
