"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, GitCommitHorizontal, LoaderCircle, ShieldAlert, X } from "lucide-react";
import { applyVerifiedPatchAction } from "@/app/actions/patch-application";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PatchApplicationView, RunVerificationStatus } from "@/lib/runs/types";
import { evaluateApplyEligibility, planFailureClassLabel, type ApplySafety, type MutationEligibilityLevel, type PlanFailureClass, type VerificationOutcome } from "@/lib/verification-assessment";
import { cn, formatDate, truncateSha } from "@/lib/utils";

const initialState = { ok: false } as const;

export function ApplyVerifiedPatch({ run }: { run: {
  id: string;
  repositoryFullName: string;
  pullRequestNumber: number | null;
  branch: string | null;
  verificationStatus: RunVerificationStatus;
  mutationEligible: boolean | null;
  mutationEligibilityLevel: MutationEligibilityLevel | null;
  mutationEligibilityReason: string | null;
  verificationOutcome: VerificationOutcome | null;
  assessmentPatchCheckPassed: boolean | null;
  assessmentPatchApplyPassed: boolean | null;
  assessmentFmtPassed: boolean | null;
  assessmentInitPassed: boolean | null;
  assessmentValidatePassed: boolean | null;
  assessmentPlanAttempted: boolean | null;
  assessmentPlanPassed: boolean | null;
  assessmentFullVerificationPassed: boolean | null;
  applySafety: ApplySafety | null;
  planFailure: { classification: PlanFailureClass; reasonCode: string; summary: string; detail: string } | null;
  patchSha256: string | null;
  verifiedAgainstCommitSha: string | null;
  patchAffectedFiles: string[];
  patchApplications: PatchApplicationView[];
} }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(applyVerifiedPatchAction, initialState);
  const latest = run.patchApplications[0] ?? null;
  const assessedEligibility = evaluateApplyEligibility({ ...run, planFailureClass: run.planFailure?.classification ?? null, planFailureReasonCode: run.planFailure?.reasonCode ?? null });
  const legacyVerified = run.verificationOutcome === null && run.mutationEligibilityLevel === null && run.applySafety === null && run.mutationEligible === true && run.mutationEligibilityReason === "verified_terraform_patch" && (run.verificationStatus === "verified_first_attempt" || run.verificationStatus === "verified_after_retry");
  const eligibility = assessedEligibility ?? (legacyVerified ? "verified" : null);
  const conditional = eligibility === "conditional";
  const canOffer = eligibility !== null && Boolean(run.pullRequestNumber && run.patchSha256 && run.verifiedAgainstCommitSha && run.patchAffectedFiles.length) && !latest;

  useEffect(() => {
    if (!state.ok) return;
    router.refresh();
  }, [router, state.ok]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !pending) setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, pending]);

  if (latest) return <ApplicationState application={latest} />;
  if (!canOffer) return <Unavailable reason={availabilityMessage(run)} />;

  return (
    <>
      <Card className={conditional ? "border-warning/25" : "border-success/25"}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><CardTitle>{conditional ? "Patch validated, full plan blocked" : "Verified patch"}</CardTitle><CardDescription className="mt-1">{conditional ? "Patch safety, fmt, init, and validate passed; Terraform plan was blocked by an external condition." : `All isolated Terraform verification stages passed, including plan, against ${truncateSha(run.verifiedAgainstCommitSha!)}.`}</CardDescription></div>
            <Badge className={conditional ? "border-warning/25 bg-warning-muted text-warning-foreground" : "border-success/25 bg-success-muted text-success-foreground"} variant="outline">{conditional ? <ShieldAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}{conditional ? "Environment blocked" : "Fully verified"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="text-xs leading-5 text-muted-foreground">{conditional ? <><p>{planFailureClassLabel(run.planFailure?.classification ?? null)}: {run.planFailure?.summary ?? "external condition reported"}.</p><p className="font-medium text-warning-foreground">This patch has not passed a complete Terraform plan.</p></> : <><p>Review the suggested diff before applying it.</p><p>Terraform verification does not establish developer intent.</p></>}</div>
          <Button onClick={() => setOpen(true)}>{conditional ? "Apply validated patch" : "Apply to PR"}</Button>
        </CardContent>
      </Card>
      {open && !state.ok ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="apply-dialog-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div><h2 id="apply-dialog-title" className="font-semibold">{conditional ? "Apply conditionally verified fix?" : "Apply verified fix"}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Explicitly authorize one TerraFix bot commit to this same-repository PR branch.</p></div>
              <Button type="button" variant="ghost" size="icon" aria-label="Close" disabled={pending} onClick={() => setOpen(false)}><X aria-hidden="true" /></Button>
            </div>
            <form action={action} className="space-y-5 p-5">
              <input type="hidden" name="runId" value={run.id} />
              <input type="hidden" name="patchSha256" value={run.patchSha256!} />
              <input type="hidden" name="expectedHeadSha" value={run.verifiedAgainstCommitSha!} />
              <input type="hidden" name="conditionalApproval" value={conditional ? "true" : "false"} />
              <dl className="grid gap-3 rounded-lg border bg-secondary/20 p-4 text-xs sm:grid-cols-2">
                <Detail label="Repository" value={run.repositoryFullName} />
                <Detail label="Pull request" value={`#${run.pullRequestNumber}`} />
                <Detail label="Branch" value={run.branch ?? "Confirmed again from GitHub"} />
                <Detail label="Verified head" value={truncateSha(run.verifiedAgainstCommitSha!)} mono />
                <div className="sm:col-span-2"><Detail label="Affected files" value={run.patchAffectedFiles.join(", ")} mono /></div>
              </dl>
              {conditional ? <div className="space-y-3 rounded-lg border border-warning/25 bg-warning-muted p-4 text-xs leading-5"><p className="font-semibold text-warning-foreground"><ShieldAlert aria-hidden="true" className="mr-1.5 inline size-4" />This patch has not passed a full Terraform plan.</p><p>Patch check, patch apply, terraform fmt, init, and validate passed. Plan was blocked by <strong>{planFailureClassLabel(run.planFailure?.classification ?? null)}</strong>.</p><p><strong>Reason:</strong> {run.planFailure?.summary ?? "Not reported"}</p><p>TerraFix will verify again. It stops without pushing if the result becomes semantic, unknown, invalid, or differs from the environmental condition approved here.</p></div> : <div className="rounded-lg border border-warning/25 bg-warning-muted p-4 text-xs leading-5 text-warning-foreground"><ShieldAlert aria-hidden="true" className="mr-1.5 inline size-4" />TerraFix will recheck the PR head, reapply the exact verified patch in a temporary checkout, rerun safe Terraform verification, then push one non-force commit. It will not merge the PR or run Terraform apply.</div>}
              {state.message && !state.ok ? <p role="alert" className="text-xs text-danger-foreground">{state.message}</p> : null}
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? <><LoaderCircle aria-hidden="true" className="animate-spin" />Checking and queuing…</> : conditional ? "Apply validated patch" : "Apply verified fix"}</Button></div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ApplicationState({ application }: { application: PatchApplicationView }) {
  const active = application.status === "pending" || application.status === "applying";
  const applied = application.status === "applied";
  const verification = Object.entries(application.freshVerification.stages);
  const conditional = application.eligibilityLevel === "conditional" && application.conditionalApproval;
  return <Card className={cn(applied && (conditional ? "border-warning/25" : "border-success/25"), (application.status === "stale" || application.status === "rejected" || application.status === "failed") && "border-danger/25")}><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{applied ? conditional ? "Validated patch applied" : "Verified fix applied" : active ? conditional ? "Applying validated patch…" : "Applying verified fix…" : application.status === "stale" ? "Verified patch is stale" : "Patch application stopped"}</CardTitle><CardDescription className="mt-1">{applied ? application.freshVerification.outcome === "fully_verified" ? "Fresh Terraform plan passed before TerraFix pushed the commit." : "Fresh verification confirmed the explicitly approved environmental plan block before TerraFix pushed the commit." : active ? stageLabel(application.stage) : application.errorMessage ?? "No source commit was pushed."}</CardDescription></div><Badge variant="outline" className="capitalize">{active ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : applied ? <CheckCircle2 aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}{application.status}</Badge></div></CardHeader><CardContent className="space-y-4"><dl className="grid gap-3 text-xs sm:grid-cols-2"><Detail label="Requested by" value={application.requestedBy ?? "Dashboard user"} /><Detail label="Requested at" value={formatDate(application.requestedAt)} /><Detail label="Approval" value={conditional ? "Conditional environmental block accepted" : "Fully verified"} /><Detail label="Verified head" value={truncateSha(application.verifiedAgainstCommitSha)} mono /><Detail label="Patch SHA" value={application.patchSha256.slice(0, 12)} mono />{application.commitSha ? <Detail label="Commit" value={truncateSha(application.commitSha)} mono /> : null}<Detail label="Branch" value={application.headBranch} mono /></dl>{verification.length ? <div><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Fresh verification</p><div className="mt-2 flex flex-wrap gap-2">{verification.map(([stage, result]) => <Badge key={stage} variant="outline" className={result.status === "passed" ? "border-success/25 bg-success-muted text-success-foreground" : result.status === "failed" ? "border-danger/25 bg-danger-muted text-danger-foreground" : ""}>{stage.replaceAll("_", " ")} · {result.status.replaceAll("_", " ")}</Badge>)}</div></div> : null}{application.commitUrl || application.pullRequestUrl ? <div className="flex flex-wrap gap-2">{application.commitUrl ? <a href={application.commitUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}><GitCommitHorizontal aria-hidden="true" />View commit <ExternalLink aria-hidden="true" /></a> : null}{application.pullRequestUrl ? <a href={application.pullRequestUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>View pull request <ExternalLink aria-hidden="true" /></a> : null}</div> : null}{application.status === "stale" ? <p className="text-xs text-muted-foreground">The PR changed since verification. TerraFix will never offer “Apply anyway”; run a new diagnosis on the latest head.</p> : null}</CardContent></Card>;
}

function Unavailable({ reason }: { reason: string }) { return <Card><CardContent className="flex items-start gap-3 py-5"><ShieldAlert aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" /><div><h3 className="text-sm font-semibold">Apply unavailable</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{reason}</p></div></CardContent></Card>; }
function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div><dt className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</dt><dd className={cn("mt-1 break-words", mono && "font-mono")}>{value}</dd></div>; }
function stageLabel(stage: string) { return ({ checking_pr_head: "Checking PR head", checking_patch: "Checking exact patch", applying_patch: "Applying patch", verifying_files: "Checking file scope", fresh_verification: "Re-verifying Terraform", creating_commit: "Creating commit", pushing_branch: "Pushing branch", publishing_result: "Updating PR publication", queued: "Waiting for a worker" } as Record<string, string>)[stage] ?? "Applying verified patch"; }
function availabilityMessage(run: { mutationEligible: boolean | null; mutationEligibilityReason: string | null; pullRequestNumber: number | null; verifiedAgainstCommitSha: string | null; verificationStatus: RunVerificationStatus; verificationOutcome: VerificationOutcome | null; planFailure: { summary: string } | null }) {
  if (run.mutationEligible === null) return "This diagnosis predates TerraFix verified-patch provenance. Run TerraFix again to enable Apply to PR.";
  if (!run.pullRequestNumber) return "Apply to PR is available only for pull-request diagnoses.";
  if (!run.verifiedAgainstCommitSha) return "This diagnosis was not anchored to an exact Git commit.";
  if (run.verificationStatus === "patch_rejected") return "Patch rejected during safety verification. This candidate is not eligible for application.";
  if (run.verificationOutcome === "semantic_failure") return `Terraform plan found a remaining configuration issue. ${run.planFailure?.summary ?? "Run TerraFix again after the diagnosis is corrected."}`;
  if (run.verificationOutcome === "unknown_failure") return "Terraform plan failed for a reason TerraFix could not classify safely. TerraFix fails closed for unknown verification failures.";
  if (run.verificationStatus !== "verified_first_attempt" && run.verificationStatus !== "verified_after_retry") return "Only successfully verified patches can be applied.";
  return run.mutationEligibilityReason ? `Agent eligibility: ${run.mutationEligibilityReason.replaceAll("_", " ")}.` : "The verified artifact is incomplete.";
}
