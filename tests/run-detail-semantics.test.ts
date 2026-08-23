import { describe, expect, it } from "vitest";
import {
  authoritativeReductionRatio,
  buildRunTimeline,
  suggestedPatchDescription,
  verificationAttemptSteps,
  verificationTimelineState,
} from "@/lib/runs/presentation";
import type { RunAttemptView } from "@/lib/runs/types";

function timelineRun(overrides: Partial<Parameters<typeof buildRunTimeline>[0]> = {}): Parameters<typeof buildRunTimeline>[0] {
  return {
    verificationStatus: "verified_first_attempt", verificationFailedStage: null,
    failureMemoryReused: false, failureMemoryStatus: "miss", freshVerificationPassed: null,
    sourceCharactersAvailable: 1639, sourceCharactersSelected: 0, llmCallCount: 1,
    finalModelTier: "free", inputTokens: 842, attempts: [], contextEscalated: false,
    schemaRetrieved: false, contextEscalationReason: null, modelEscalated: false,
    initialModelTier: "free", initialModel: "model-a", finalModel: "model-a",
    candidateSource: "llm", suggestedPatch: "diff", pullRequestNumber: 12, publication: null,
    ...overrides,
  };
}

function attempt(overrides: Partial<RunAttemptView> = {}): RunAttemptView {
  return { attempt: 1, status: "verified", failedStage: null, commands: {}, warnings: [], ...overrides };
}

describe("run detail telemetry and timeline semantics", () => {
  it("calculates reduction only from authoritative available and selected counts", () => {
    expect(authoritativeReductionRatio(1639, 0)).toBe(1);
    expect(authoritativeReductionRatio(100, 25)).toBe(0.75);
    expect(authoritativeReductionRatio(1639, null)).toBeNull();
    expect(authoritativeReductionRatio(null, 0)).toBeNull();
    expect(authoritativeReductionRatio(0, 0)).toBeNull();
  });

  it.each([
    ["verified_first_attempt", "success"],
    ["verified_after_retry", "success"],
    ["patch_rejected", "rejected"],
    ["verification_failed", "failure"],
    ["verification_unavailable", "warning"],
    ["verification_skipped", "skipped"],
  ] as const)("maps %s Terraform verification to %s", (status, expected) => {
    expect(verificationTimelineState(status)).toBe(expected);
    const event = buildRunTimeline(timelineRun({ verificationStatus: status, verificationFailedStage: "patch_check" })).find((item) => item.label === "Terraform verification");
    expect(event?.state).toBe(expected);
  });

  it("keeps published PR state green when the patch was rejected", () => {
    const events = buildRunTimeline(timelineRun({ verificationStatus: "patch_rejected", verificationFailedStage: "patch_check", publication: { status: "published" } }));
    expect(events.find((event) => event.label === "Terraform verification")).toMatchObject({ state: "rejected", detail: "Patch rejected at Patch Check" });
    expect(events.find((event) => event.label === "PR publication")).toMatchObject({ state: "published", detail: "Published" });
  });

  it("uses memory-specific ordering without claiming an LLM diagnosis", () => {
    const events = buildRunTimeline(timelineRun({ failureMemoryReused: true, failureMemoryStatus: "hit_verified", freshVerificationPassed: true, llmCallCount: 0, publication: { status: "published" } }));
    expect(events.map((event) => event.label)).toEqual(["Verified memory lookup", "Fresh Terraform verification", "PR publication"]);
  });

  it("shows rejected patch check and later stages as not run", () => {
    const steps = verificationAttemptSteps(attempt({ status: "rejected", failedStage: "patch_check" }));
    expect(steps.map((step) => [step.name, step.status])).toEqual([
      ["patch_check", "rejected"], ["patch_apply", "not_run"], ["fmt", "not_run"],
      ["init", "not_run"], ["validate", "not_run"], ["plan", "not_run"],
    ]);
  });

  it("shows explicit successful verification commands as passed", () => {
    const passed = { status: "passed" as const, durationMs: 1, exitCode: 0 };
    const steps = verificationAttemptSteps(attempt({ commands: { patch_check: passed, patch_apply: passed, fmt: passed, init: passed, validate: passed, plan: passed } }));
    expect(steps.every((step) => step.status === "passed")).toBe(true);
  });

  it("does not turn missing command telemetry into not-run for a verified legacy attempt", () => {
    expect(verificationAttemptSteps(attempt()).every((step) => step.status === "unknown")).toBe(true);
  });

  it("distinguishes an unavailable stopped stage from later commands that were not run", () => {
    const skipped = { status: "skipped" as const, durationMs: 0, exitCode: null };
    const steps = verificationAttemptSteps(attempt({ status: "unavailable", failedStage: "init", commands: { patch_check: { status: "passed", durationMs: 1, exitCode: 0 }, patch_apply: { status: "passed", durationMs: 1, exitCode: 0 }, fmt: { status: "passed", durationMs: 1, exitCode: 0 }, init: skipped, validate: skipped, plan: skipped } }));
    expect(steps.map((step) => step.status)).toEqual(["passed", "passed", "passed", "unavailable", "not_run", "not_run"]);
  });

  it("describes suggested patches according to verification outcome", () => {
    expect(suggestedPatchDescription("patch_rejected")).toContain("did not pass patch safety verification");
    expect(suggestedPatchDescription("verified_after_retry")).toContain("successfully verified");
    expect(suggestedPatchDescription("verification_unavailable")).toContain("could not be completed");
  });
});
