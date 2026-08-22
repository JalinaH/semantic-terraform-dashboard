import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModelPolicySelector, type ModelPickerEntry } from "@/components/model-policy-selector";

const free: ModelPickerEntry = { modelId: "openrouter/free", displayName: "OpenRouter Free", upstreamProvider: "openrouter", tier: "FREE", allowed: true, available: true, recommended: true, isFree: true, contextLength: 128_000, pricingPromptPerMillion: "0", pricingOutputPerMillion: "0" };
const paid: ModelPickerEntry = { ...free, modelId: "openai/gpt-4o-mini", displayName: "GPT-4o mini", upstreamProvider: "openai", tier: "ECONOMY", allowed: false, isFree: false, pricingPromptPerMillion: "0.15", pricingOutputPerMillion: "0.6" };

function render(models: ModelPickerEntry[], routing: "auto" | "fixed" = "auto") {
  return renderToStaticMarkup(<ModelPolicySelector initial={{ modelProvider: "openrouter", model: "openrouter/free", modelRouting: routing, maxModelTier: "free", fixedModelId: routing === "fixed" ? "openrouter/free" : null, modelPolicyVersion: "terrafix_model_policy_v1" }} maximumAllowedTier="FREE" models={models} lastSyncedAt="2026-08-23T00:00:00.000Z" pricingMayBeStale={false} />);
}

describe("model policy UI", () => {
  it("recommends Auto Optimize and exposes locked future tiers", () => {
    const html = render([free, paid]);
    expect(html).toContain("Auto Optimize");
    expect(html).toContain("Recommended");
    expect(html).toContain(">free<");
    expect(html).toContain("Coming later");
    expect(html).not.toContain("checkout");
  });

  it("shows authoritative free pricing and paid-access lock in the fixed picker", () => {
    const html = render([free, paid], "fixed");
    expect(html).toContain("$0 / 1M input");
    expect(html).toContain("Requires paid access");
    expect(html).toContain("Provider pricing");
    expect(html).not.toContain("OPENROUTER_API_KEY");
  });

  it("renders a safe unavailable state without production fixtures", () => {
    expect(render([], "fixed")).toContain("Model catalog unavailable");
  });
});
