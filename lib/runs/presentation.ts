import { STAGE_LABELS } from "@/lib/constants";
import type { RunAttemptView, RunVerificationStatus } from "@/lib/runs/types";
import type { VerificationOutcome } from "@/lib/verification-assessment";
import type { StageStatus, VerificationStage, VerificationStep } from "@/lib/types";

export type TimelineEventState = "success" | "failure" | "rejected" | "skipped" | "neutral" | "published" | "warning";

export interface TimelineEvent {
  label: string;
  detail: string | null;
  state: TimelineEventState;
}

interface TimelineRun {
  verificationStatus: RunVerificationStatus;
  verificationFailedStage: string | null;
  failureMemoryReused: boolean | null;
  failureMemoryStatus: string | null;
  freshVerificationPassed: boolean | null;
  sourceCharactersAvailable: number | null;
  sourceCharactersSelected: number | null;
  llmCallCount: number | null;
  finalModelTier: string | null;
  inputTokens: number | null;
  attempts: RunAttemptView[];
  contextEscalated: boolean | null;
  schemaRetrieved: boolean | null;
  contextEscalationReason: string | null;
  modelEscalated: boolean | null;
  initialModelTier: string | null;
  initialModel: string | null;
  finalModel: string | null;
  candidateSource: string | null;
  suggestedPatch: string | null;
  pullRequestNumber: number | null;
  publication: { status: string } | null;
  verificationOutcome: VerificationOutcome | null;
  llmCalls: Array<{ type: string }>;
}

const stageOrder: VerificationStage[] = ["patch_check", "patch_apply", "fmt", "init", "validate", "plan"];

export function authoritativeReductionRatio(available: number | null, selected: number | null) {
  if (available === null || selected === null || available <= 0) return null;
  return Math.min(Math.max((available - selected) / available, 0), 1);
}

export function suggestedPatchDescription(status: RunVerificationStatus, outcome: VerificationOutcome | null = null) {
  if (outcome === "fully_verified") return "Candidate diff produced and successfully verified in an isolated workspace, including Terraform plan.";
  if (outcome === "locally_validated") return "Candidate diff passed patch safety and isolated local Terraform fmt, init, and validate. Provider-aware plan was not requested.";
  if (outcome === "environment_blocked") return "Candidate diff passed patch safety, fmt, init, and validate, but full Terraform plan was blocked by the execution environment.";
  if (outcome === "semantic_failure") return "Candidate diff produced, but Terraform plan found a remaining configuration problem.";
  if (outcome === "unknown_failure") return "Candidate diff produced, but Terraform plan failed for a reason TerraFix could not classify safely.";
  if (outcome === "patch_invalid") return "Candidate diff produced by TerraFix. This candidate did not pass patch safety verification.";
  if (status === "verified_first_attempt" || status === "verified_after_retry" || status === "locally_validated_first_attempt" || status === "locally_validated_after_retry") return "Candidate diff produced and successfully verified in an isolated workspace.";
  if (status === "patch_rejected") return "Candidate diff produced by TerraFix. This candidate did not pass patch safety verification.";
  if (status === "verification_unavailable") return "Candidate diff produced, but full verification could not be completed.";
  if (status === "verification_skipped") return "Candidate diff produced, but Terraform verification was not run.";
  if (status === "verification_failed") return "Candidate diff produced, but it did not pass isolated Terraform verification.";
  return "Candidate diff produced; verification is still pending.";
}

export function verificationTimelineState(status: RunVerificationStatus): TimelineEventState {
  if (status === "verified_first_attempt" || status === "verified_after_retry" || status === "locally_validated_first_attempt" || status === "locally_validated_after_retry") return "success";
  if (status === "patch_rejected") return "rejected";
  if (status === "verification_failed") return "failure";
  if (status === "verification_unavailable") return "warning";
  if (status === "verification_skipped") return "skipped";
  return "neutral";
}

export function verificationTimelineDetail(status: RunVerificationStatus, failedStage: string | null) {
  const stage = failedStage ? stageLabel(failedStage) : null;
  if (status === "verified_first_attempt") return "Verified on the first attempt";
  if (status === "verified_after_retry") return "Verified after retry";
  if (status === "locally_validated_first_attempt") return "Local Terraform verification succeeded on the first attempt";
  if (status === "locally_validated_after_retry") return "Local Terraform verification succeeded after retry";
  if (status === "patch_rejected") return stage ? `Patch rejected at ${stage}` : "Patch rejected";
  if (status === "verification_failed") return stage ? `Failed at ${stage}` : "Verification failed";
  if (status === "verification_unavailable") return stage ? `Verification unavailable during ${stage}` : "Verification unavailable";
  if (status === "verification_skipped") return "Verification skipped";
  return "Verification pending";
}

export function verificationAttemptSteps(attempt: RunAttemptView): VerificationStep[] {
  const failedIndex = attempt.failedStage ? stageOrder.indexOf(attempt.failedStage as VerificationStage) : -1;
  return stageOrder.map((stage, index) => {
    const command = attempt.commands[stage];
    let status: StageStatus;
    if (command?.status === "passed") status = "passed";
    else if (command?.status === "skipped") status = attempt.status === "unavailable" && attempt.failedStage === stage ? "unavailable" : "not_run";
    else if (command?.status === "error") status = "unavailable";
    else if (command?.status === "failed") status = attempt.status === "rejected" && attempt.failedStage === stage ? "rejected" : "failed";
    else if (failedIndex >= 0 && index === failedIndex) status = attempt.status === "rejected" ? "rejected" : attempt.status === "unavailable" ? "unavailable" : attempt.status === "skipped" ? "not_run" : "failed";
    else if ((failedIndex >= 0 && index > failedIndex) || attempt.status === "skipped") status = "not_run";
    else status = "unknown";
    return { name: stage, label: STAGE_LABELS[stage], status };
  });
}

export function buildRunTimeline(run: TimelineRun): TimelineEvent[] {
  if (run.failureMemoryReused) {
    return [
      { label: "Verified memory lookup", detail: run.failureMemoryStatus ? displayLabel(run.failureMemoryStatus) : "Reused", state: "success" },
      { label: "Fresh Terraform verification", detail: verificationTimelineDetail(run.verificationStatus, run.verificationFailedStage), state: verificationTimelineState(run.verificationStatus) },
      publicationEvent(run),
    ];
  }

  const events: TimelineEvent[] = [
    { label: "Failure detected", detail: null, state: "success" },
    { label: "Minimal context built", detail: run.sourceCharactersAvailable !== null && run.sourceCharactersSelected !== null ? `${run.sourceCharactersAvailable.toLocaleString()} available · ${run.sourceCharactersSelected.toLocaleString()} source-block characters selected` : "Context details not reported", state: "success" },
  ];
  if (run.llmCallCount !== 0) {
    const details = [run.finalModelTier?.toUpperCase(), run.inputTokens === null ? null : `${run.inputTokens.toLocaleString()} input tokens`].filter(Boolean);
    events.push({ label: "Model diagnosis", detail: details.join(" · ") || null, state: "success" });
  }
  if (run.suggestedPatch || run.attempts.length) events.push({ label: "Candidate patch generated", detail: run.candidateSource === "verified_failure_memory" ? "Reused verified candidate" : null, state: "success" });
  if (run.attempts.length > 1 && run.attempts[0].status !== "verified") {
    const first = run.attempts[0];
    const firstState: TimelineEventState = first.status === "rejected" ? "rejected" : first.status === "unavailable" ? "warning" : first.status === "skipped" ? "skipped" : "failure";
    events.push({ label: "Attempt 1", detail: first.planFailure ? `${displayLabel(first.planFailure.classification)} · ${first.planFailure.summary}` : first.failedStage ? `${displayLabel(first.status)} at ${stageLabel(first.failedStage)}` : displayLabel(first.status), state: firstState });
  }
  if (run.llmCalls.some((call) => call.type === "repair" || call.type === "patch_repair")) events.push({ label: "Patch repair", detail: "Malformed or rejected candidate representation repaired", state: "neutral" });
  if (run.contextEscalated) events.push({ label: "Context escalated", detail: run.schemaRetrieved ? "Sliced provider schema added" : displayLabel(run.contextEscalationReason), state: "neutral" });
  if (run.modelEscalated) events.push({ label: "Model escalated", detail: run.initialModelTier && run.finalModelTier ? `${run.initialModelTier.toUpperCase()} → ${run.finalModelTier.toUpperCase()}` : `${run.initialModel ?? "Initial model"} → ${run.finalModel ?? "final model"}`, state: "neutral" });
  if (run.verificationOutcome === "environment_blocked" && run.llmCallCount !== null) events.push({ label: "Stopped", detail: "No additional model call required for the environmental plan block", state: "warning" });
  const assessedState: TimelineEventState = run.verificationOutcome === "fully_verified" || run.verificationOutcome === "locally_validated" ? "success" : run.verificationOutcome === "environment_blocked" ? "warning" : run.verificationOutcome === "semantic_failure" || run.verificationOutcome === "patch_invalid" ? "failure" : run.verificationOutcome === "unknown_failure" ? "warning" : verificationTimelineState(run.verificationStatus);
  const assessedDetail = run.verificationOutcome === "fully_verified" ? "Full Terraform plan passed" : run.verificationOutcome === "locally_validated" ? "Local Terraform verification passed · Plan not requested (cloud verification not configured)" : run.verificationOutcome === "environment_blocked" ? "Terraform plan blocked by environment" : run.verificationOutcome === "semantic_failure" ? "Terraform plan found a configuration problem" : run.verificationOutcome === "unknown_failure" ? "Plan failure could not be classified safely" : verificationTimelineDetail(run.verificationStatus, run.verificationFailedStage);
  events.push({ label: run.verificationOutcome === "locally_validated" ? "Terraform local verification" : "Terraform verification", detail: assessedDetail, state: assessedState });
  events.push(publicationEvent(run));
  return events;
}

function publicationEvent(run: Pick<TimelineRun, "publication" | "pullRequestNumber">): TimelineEvent {
  const status = run.publication?.status ?? null;
  if (status === "published") return { label: "PR publication", detail: "Published", state: "published" };
  if (status === "failed") return { label: "PR publication", detail: "Publication failed", state: "failure" };
  if (status === "skipped") return { label: "PR publication", detail: "Skipped", state: "skipped" };
  if (status === "pending" || status === "publishing") return { label: "PR publication", detail: displayLabel(status), state: "neutral" };
  return { label: "PR publication", detail: run.pullRequestNumber ? "Not started" : "Not applicable", state: run.pullRequestNumber ? "neutral" : "skipped" };
}

function displayLabel(value: string | null) {
  return value ? value.split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "Not reported";
}

function stageLabel(stage: string) {
  const label = STAGE_LABELS[stage as VerificationStage] ?? displayLabel(stage);
  return label.replace(/\b\w/g, (character) => character.toUpperCase());
}
