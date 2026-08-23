import { validAgentResult } from "@/tests/phase5-fixtures";

export function v1AgentResult(overrides: Record<string, unknown> = {}) {
  return validAgentResult({
    agent_version: "1.0.0",
    llm_usage: {
      call_count: 2,
      input_tokens: 3700,
      cached_input_tokens: 1100,
      output_tokens: 420,
      reasoning_tokens: 90,
      total_tokens: 4120,
      cost_usd: 0.00252,
      latency_ms: 2460,
      token_counts_complete: true,
      cost_complete: true,
    },
    llm_calls: [
      { provider: "openrouter", requested_model: "openrouter/free", reported_model: "nvidia/nemotron:free", upstream_provider: "NVIDIA", input_tokens: 1420, cached_input_tokens: 1100, output_tokens: 180, reasoning_tokens: 30, total_tokens: 1600, cost_usd: 0, latency_ms: 980, cache_hit: true, call_type: "diagnosis", context_level: "minimal", routing_tier: "free", routing_reason: "initial_cheapest_eligible", call_number: 1 },
      { provider: "openrouter", requested_model: "openrouter/auto", reported_model: "provider/economy-model", upstream_provider: "Provider", input_tokens: 2280, cached_input_tokens: 0, output_tokens: 240, reasoning_tokens: 60, total_tokens: 2520, cost_usd: 0.00252, latency_ms: 1480, cache_hit: false, call_type: "repair", context_level: "schema", routing_tier: "economy", routing_reason: "provider_constraint_unresolved", call_number: 2 },
    ],
    context_optimization: { strategy: "deterministic_minimal_v1", available_source_characters: 18200, selected_source_characters: 3100, characters_avoided: 15100, reduction_ratio: 0.82967, character_reduction_ratio: 0.82967, input_token_reduction_ratio: null },
    context_telemetry: {
      mode: "progressive", prompt_characters: 4120, system_prompt_characters: 980, user_prompt_characters: 3140,
      resource_schema_included: true, git_diff_included: true, source_file_count: 2, source_block_count: 2,
      changed_line_count: 2, referenced_symbol_count: 1, schema_included: true,
      selected_context_characters: 3912, rendered_user_prompt_characters: 3140,
      sections: {
        terraform_error: { characters: 420 }, git_diff: { characters: 318 }, terraform_source: { characters: 2400 },
        supporting_context: { characters: 700 }, metadata: { characters: 94 }, provider_schema: { characters: 2100 },
      },
      calls: [],
    },
    schema_optimization: { strategy: "deterministic_schema_slice_v1", full_schema_characters: 26000, selected_schema_characters: 2100, characters_avoided: 23900, reduction_ratio: 0.91923, character_reduction_ratio: 0.91923, input_token_reduction_ratio: null },
    context_progression: { strategy: "minimal_then_schema_v1", progressive_enabled: true, initial_level: "minimal", final_level: "schema", levels_used: ["minimal", "schema"], escalated: true, escalation_count: 1, reason_code: "provider_constraint_unresolved", reason: "Provider semantic verification failure", schema_retrieval_attempted: true, schema_retrieved: true, schema_avoided: false, same_model: false },
    model_progression: { routing_mode: "auto", initial_model: "nvidia/nemotron:free", final_model: "provider/economy-model", initial_tier: "free", final_tier: "economy", model_escalated: true, tier_escalated: true, max_allowed_tier: "economy", models_used: ["nvidia/nemotron:free", "provider/economy-model"], decisions: [] },
    cache: { failure_memory: { status: "miss", format_version: "1", reused: false, fresh_verification_passed: null, llm_calls_avoided: 0, historical_total_tokens_avoided: null, historical_cost_avoided_usd: null }, provider_schema: { status: "miss", format_version: "1" }, schema_slice: { status: "miss", format_version: "1" } },
    resolution_source: "llm",
    ...overrides,
  });
}
