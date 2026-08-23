import { redactPublicationSecrets } from "@/lib/publication/redact";
import type { AgentCommentInput, PublicationAttempt, RenderedAgentComment, VerificationStatus } from "@/lib/publication/types";

export const AGENT_COMMENT_MARKER = "<!-- semantic-terraform-agent -->";
export const MAX_PR_COMMENT_PATCH_CHARS = 12_000;
export const MAX_PR_COMMENT_CHARS = 48_000;
const STAGES = ["patch_check", "patch_apply", "fmt", "init", "validate", "plan"] as const;

export function renderAgentComment(input: AgentCommentInput): RenderedAgentComment {
  const warnings = new Set<string>();
  const safe = (value: string, limit: number) => {
    const redacted = redactPublicationSecrets(value.slice(0, limit));
    redacted.warnings.forEach((warning) => warnings.add(warning));
    return escapeProse(redacted.content);
  };
  const resources = input.affectedResources.slice(0, 20).map((resource) => inlineCode(safe(resource, 300)));
  const patchResult = boundPatch(input.suggestedPatch ?? "", MAX_PR_COMMENT_PATCH_CHARS);
  const redactedPatch = redactPublicationSecrets(patchResult.patch);
  redactedPatch.warnings.forEach((warning) => warnings.add(warning));
  const attempt = latestAttempt(input.attempts);
  const status = statusPresentation(input.verificationStatus, attempt?.failedStage ?? null);
  const dashboardLine = input.dashboardUrl ? `[View full diagnosis and TerraFix usage details](${input.dashboardUrl})` : "View the full diagnosis and TerraFix usage details in the dashboard.";
  const repairLines = repairSummary(input.verificationStatus, input.attempts);
  const applicationLines = input.application ? [
    "",
    "### Application",
    "✅ **Verified fix applied by TerraFix**",
    `**Commit:** ${input.application.commitUrl ? `[${inlineCode(input.application.commitSha.slice(0, 12))}](${input.application.commitUrl})` : inlineCode(input.application.commitSha.slice(0, 12))}`,
    `**Requested by:** ${input.application.requestedBy ? safe(input.application.requestedBy, 120) : "TerraFix dashboard user"}`,
    "Normal CI is running again. TerraFix does not claim CI success until GitHub reports it.",
  ] : [];
  const patchSection = redactedPatch.content
    ? `\n<details>\n<summary>Suggested patch</summary>\n\n${fencedDiff(redactedPatch.content)}${patchResult.truncated ? "\n\n_… patch truncated. View the full diagnosis in the dashboard._" : ""}\n\n</details>\n`
    : "";

  const body = [
    AGENT_COMMENT_MARKER,
    `<!-- semantic-terraform-agent-run:${safeMarker(input.runId)} -->`,
    "## TerraFix verified diagnosis",
    "",
    "### Root cause",
    safe(input.rootCause, 4_000),
    "",
    "### Affected resources",
    resources.length ? resources.map((resource) => `- ${resource}`).join("\n") : "- Not reported",
    "",
    "### Violated constraint",
    input.violatedConstraint ? safe(input.violatedConstraint, 2_000) : "Not reported",
    "",
    "### Suggested change",
    input.suggestedPatch ? "Review the bounded candidate patch below." : "No candidate patch was produced.",
    "",
    "### Terraform verification",
    verificationLines(attempt),
    "",
    `**Final status:** ${status.label}`,
    status.explanation,
    `**Repair attempt used:** ${input.verificationStatus === "verified_after_retry" ? "Yes" : "No"}`,
    ...repairLines,
    `**Model confidence:** ${score(input.modelConfidence)}`,
    `**Evidence score:** ${score(input.evidenceScore)}`,
    patchSection,
    status.verified ? "Terraform verification passed." : "The candidate recommendation was not fully verified.",
    "**Human review is still required because verification does not establish developer intent.**",
    ...applicationLines,
    "",
    dashboardLine,
  ].join("\n");

  const finalRedaction = redactPublicationSecrets(body);
  finalRedaction.warnings.forEach((warning) => warnings.add(warning));
  const bounded = boundCompleteComment(finalRedaction.content, input, status.label, dashboardLine);
  return { body: bounded, redactionWarnings: [...warnings], patchTruncated: patchResult.truncated || bounded.length < finalRedaction.content.length };
}

function verificationLines(attempt: PublicationAttempt | undefined) {
  return STAGES.map((stage) => {
    const command = attempt?.commands[stage];
    const status = command?.status ?? "skipped";
    const view = status === "passed" ? ["✅", "passed"] : status === "skipped" ? ["⏭️", "skipped"] : ["❌", "failed"];
    return `- ${view[0]} ${inlineCode(stageLabel(stage))}: ${view[1]}`;
  }).join("\n");
}

function statusPresentation(status: VerificationStatus, failedStage: string | null) {
  const failedAt = failedStage ? ` at ${inlineCode(escapeProse(failedStage.slice(0, 100)))}` : "";
  const presentations: Record<VerificationStatus, { label: string; explanation: string; verified: boolean }> = {
    verified_first_attempt: { label: "VERIFIED FIRST ATTEMPT", explanation: "The initial candidate passed the configured isolated Terraform verification stages.", verified: true },
    verified_after_retry: { label: "VERIFIED AFTER REPAIR", explanation: "The initial candidate failed, and one bounded repair attempt passed verification.", verified: true },
    verification_failed: { label: "NOT VERIFIED", explanation: `A candidate was produced, but Terraform verification failed${failedAt}.`, verified: false },
    patch_rejected: { label: "PATCH REJECTED", explanation: "The generated patch failed safety or applicability checks and was not accepted.", verified: false },
    verification_unavailable: { label: "VERIFICATION UNAVAILABLE", explanation: "The verification environment could not complete the required checks; this does not prove that the patch is incorrect.", verified: false },
    verification_skipped: { label: "VERIFICATION SKIPPED", explanation: "Terraform verification was not performed.", verified: false },
    pending: { label: "PENDING", explanation: "Terraform verification has not completed.", verified: false },
  };
  return presentations[status];
}

function repairSummary(status: VerificationStatus, attempts: PublicationAttempt[]) {
  if (status !== "verified_after_retry") return [];
  return attempts.slice(0, 2).map((attempt) => `- Attempt ${attempt.attempt}: ${attempt.status === "verified" ? "verified" : attempt.failedStage ? `failed at ${escapeProse(attempt.failedStage.slice(0, 100))}` : attempt.status}`);
}

function latestAttempt(attempts: PublicationAttempt[]) {
  return [...attempts].sort((a, b) => b.attempt - a.attempt)[0];
}

function boundPatch(patch: string, maximum: number) {
  if (patch.length <= maximum) return { patch, truncated: false };
  return { patch: patch.slice(0, maximum), truncated: true };
}

function fencedDiff(patch: string) {
  const longest = Math.max(0, ...[...patch.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}diff\n${patch}\n${fence}`;
}

function boundCompleteComment(body: string, input: AgentCommentInput, finalStatus: string, dashboardLine: string) {
  if (body.length <= MAX_PR_COMMENT_CHARS) return body;
  const rootCause = escapeProse(redactPublicationSecrets(input.rootCause.slice(0, 2_000)).content);
  const resource = inlineCode(escapeProse((input.affectedResources[0] ?? "Not reported").slice(0, 300)));
  return [AGENT_COMMENT_MARKER, `<!-- semantic-terraform-agent-run:${safeMarker(input.runId)} -->`, "## TerraFix verified diagnosis", "", "### Root cause", rootCause, "", "### Affected resource", resource, "", `**Final status:** ${finalStatus}`, "", "_Optional evidence and patch were omitted because the comment exceeded the publication limit._", "", "**Human review is still required because verification does not establish developer intent.**", "", dashboardLine].join("\n").slice(0, MAX_PR_COMMENT_CHARS);
}

function escapeProse(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\r\n]+/g, " ").trim();
}

function inlineCode(value: string) {
  const normalized = value.replace(/`/g, "'");
  return `\`${normalized}\``;
}

function stageLabel(stage: typeof STAGES[number]) {
  return ({ patch_check: "patch check", patch_apply: "patch apply", fmt: "terraform fmt", init: "terraform init", validate: "terraform validate", plan: "terraform plan" })[stage];
}

function score(value: number | null) {
  return value === null || !Number.isFinite(value) ? "Not reported" : Math.max(0, Math.min(1, value)).toFixed(2);
}

function safeMarker(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 128) || "unknown";
}
