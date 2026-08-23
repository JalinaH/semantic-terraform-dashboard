import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BrainCircuit, CheckCircle2, Clock3, ExternalLink, FileCode2, GitCommitHorizontal, GitPullRequest, MessageSquareText, ShieldCheck, Sparkles, Timer, TriangleAlert } from "lucide-react";
import { republishPrCommentAction } from "@/app/actions/publication";
import { DiffViewer } from "@/components/diff-viewer";
import { ApplyVerifiedPatch } from "@/components/apply-verified-patch";
import { RunPoller } from "@/components/run-poller";
import { RunStatusBadge } from "@/components/run-status-badge";
import { PublicationStatusBadge } from "@/components/publication-status-badge";
import { RepublishButton } from "@/components/republish-button";
import { RunObservability } from "@/components/run-observability";
import { StatusBadge } from "@/components/status-badge";
import { VerificationSteps } from "@/components/verification-steps";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getAgentRunForUser } from "@/lib/data/runs";
import { suggestedPatchDescription, verificationAttemptSteps } from "@/lib/runs/presentation";
import type { RunAttemptView, RunDetail } from "@/lib/runs/types";
import { getWorkerErrorPresentation } from "@/lib/worker/user-errors";
import { cn, formatDate, formatRuntime, truncateSha } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TerraFix Agent Run",
  description: "Hosted diagnosis and isolated Terraform verification evidence.",
};

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthenticatedUser();
  const { id } = await params;
  const run = await getAgentRunForUser(user.id, id);
  if (!run) notFound();
  const active = run.status === "queued" || run.status === "running" || run.patchApplications.some((application) => application.status === "pending" || application.status === "applying");

  return (
    <div className="space-y-7">
      <RunPoller active={active} />
      <header>
        <Link href="/runs" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-3 text-muted-foreground")}><ArrowLeft aria-hidden="true" />Agent runs</Link>
        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{run.id}</span><RunStatusBadge status={run.status} /><StatusBadge status={run.verificationStatus} /></div>
            <h1 className="mt-3 truncate font-mono text-xl font-semibold tracking-[-0.025em] sm:text-2xl">{run.affectedResource ?? run.githubWorkflowName ?? "Terraform diagnosis"}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <Link href={`/repositories/${run.repositoryId}`} className="font-medium text-foreground hover:underline">{run.repositoryFullName}</Link>
              <span className="inline-flex items-center gap-1.5">{run.pullRequestNumber ? <GitPullRequest aria-hidden="true" className="size-3.5" /> : <GitCommitHorizontal aria-hidden="true" className="size-3.5" />}{run.pullRequestNumber ? `PR #${run.pullRequestNumber}` : truncateSha(run.commitSha)}</span>
              <span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" className="size-3.5" />{formatDate(run.createdAt)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><HeaderMetric label={active ? "Worker stage" : "Failed stage"} value={active ? formatLabel(run.workerStage) : run.failedStage ?? "—"} /><HeaderMetric label="Context" value={run.contextMode} /><HeaderMetric label="Runtime" value={run.totalRuntimeMs === null ? "—" : formatRuntime(run.totalRuntimeMs)} /></div>
        </div>
      </header>

      {active ? <StateCard title={run.status === "queued" ? "Waiting for a worker" : "Diagnosis in progress"} description={run.status === "queued" ? "The signed GitHub delivery passed filtering and is queued for a hosted worker." : `Current stage: ${formatLabel(run.workerStage)}. The complete hosted job is protected by a bounded execution deadline.`} /> : null}
      {run.status === "failed" ? <ErrorCard title="Hosted execution failed" code={run.errorCode} /> : null}
      {run.status === "skipped" ? <StateCard title="Execution skipped" description={skipMessage(run.skipReason)} /> : null}

      <RunObservability run={run} />

      <section aria-labelledby="publication-heading">
        <SectionHeading id="publication-heading" icon={MessageSquareText} title="PR publication" description="A separate idempotent publication lifecycle; GitHub failures never change the diagnosis outcome." />
        <Card>
          <CardContent className="flex flex-col justify-between gap-4 pt-5 sm:flex-row sm:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {run.publication ? <PublicationStatusBadge status={run.publication.status} /> : run.pullRequestNumber ? <Badge variant="outline">Not started</Badge> : <PublicationStatusBadge status="skipped" />}
                {run.publication?.attemptCount ? <span className="text-xs text-muted-foreground">{run.publication.attemptCount} publication attempt{run.publication.attemptCount === 1 ? "" : "s"}</span> : null}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{publicationDescription(run.publication, Boolean(run.pullRequestNumber))}</p>
              {run.publication?.publishedAt ? <p className="mt-1 text-[11px] text-muted-foreground">Published {formatDate(run.publication.publishedAt)}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {run.publication?.commentUrl ? <Link href={run.publication.commentUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>View on GitHub <ExternalLink aria-hidden="true" /></Link> : null}
              {run.status === "completed" && run.pullRequestNumber ? <form action={republishPrCommentAction}><input type="hidden" name="runId" value={run.id} /><RepublishButton /></form> : null}
            </div>
          </CardContent>
        </Card>
      </section>

      {run.rootCause ? (
        <section aria-labelledby="diagnosis-heading">
          <SectionHeading id="diagnosis-heading" icon={BrainCircuit} title="Diagnosis" description="Safe structured evidence ingested from the Python agent result." />
          <div className="grid gap-4 xl:grid-cols-[1.5fr_0.7fr]">
            <Card><CardContent className="grid gap-5 pt-5"><EvidenceItem label="Root cause" value={run.rootCause} /><EvidenceItem label="Violated constraint" value={run.violatedConstraint ?? "Not reported"} mono /><div><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Affected resources</p><div className="mt-2 flex flex-wrap gap-2">{run.affectedResources.length ? run.affectedResources.map((resource) => <Badge key={resource} variant="outline" className="font-mono">{resource}</Badge>) : <span className="text-xs text-muted-foreground">None reported</span>}</div></div></CardContent></Card>
            <Card><CardHeader><CardTitle>Evidence quality</CardTitle><CardDescription>Model and evidence scores reported by the agent.</CardDescription></CardHeader><CardContent className="space-y-5"><Score label="Model confidence" value={run.modelConfidence} /><Score label="Evidence score" value={run.evidenceScore} /><div className="rounded-lg border bg-success-muted p-3 text-xs leading-5 text-success-foreground"><ShieldCheck aria-hidden="true" className="mr-1.5 inline size-3.5" />Diagnosis is read-only. TerraFix can push a verified patch only after a separate explicit approval, and never applies or merges infrastructure.</div></CardContent></Card>
          </div>
        </section>
      ) : null}

      {run.suggestedPatch ? <section aria-labelledby="patch-heading" className="space-y-4"><SectionHeading id="patch-heading" icon={FileCode2} title="Suggested patch" description={suggestedPatchDescription(run.verificationStatus)} /><DiffViewer diff={run.suggestedPatch} /><ApplyVerifiedPatch run={run} /></section> : null}

      {run.attempts.length ? (
        <section aria-labelledby="attempts-heading">
          <SectionHeading id="attempts-heading" icon={Sparkles} title="Verification attempts" description="The initial candidate plus at most one bounded agent repair attempt." />
          <div className="space-y-4">{run.attempts.map((attempt, index) => <AttemptCard key={attempt.attempt} attempt={attempt} reason={index === run.attempts.length - 1 ? run.verificationReason : null} />)}</div>
        </section>
      ) : null}

      {Object.keys(run.timing).length ? (
        <section aria-labelledby="performance-heading">
          <SectionHeading id="performance-heading" icon={Timer} title="Execution timing" description="Persisted bounded phase timing; no raw environment or credentials." />
          <Card><CardContent className="grid gap-px overflow-hidden p-0 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(run.timing).map(([label, value]) => <PerformanceMetric key={label} label={formatLabel(label)} value={formatRuntime(value)} />)}</CardContent></Card>
        </section>
      ) : null}
    </div>
  );
}

function AttemptCard({ attempt, reason }: { attempt: RunAttemptView; reason: string | null }) {
  const verified = attempt.status === "verified";
  const unavailable = attempt.status === "unavailable" || attempt.status === "skipped";
  const statusClass = verified ? "border-success/25 bg-success-muted text-success-foreground" : unavailable ? "border-warning/25 bg-warning-muted text-warning-foreground" : "border-danger/25 bg-danger-muted text-danger-foreground";
  const description = attempt.failedStage ? `Stopped at ${formatLabel(attempt.failedStage)}.${reason ? ` ${reason}` : ""}` : verified ? "All required verification stages passed." : reason ?? "Verification did not complete.";
  return <Card className={cn(verified && "border-success/25", !verified && !unavailable && "border-danger/25")}><CardHeader className="flex-row items-start justify-between gap-4 space-y-0"><div className="flex items-start gap-3"><span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold", statusClass)}>{attempt.attempt}</span><div><CardTitle>Attempt {attempt.attempt}</CardTitle><CardDescription className="mt-1">{description}</CardDescription></div></div><Badge variant="outline" className={cn("capitalize", statusClass)}>{verified ? <CheckCircle2 aria-hidden="true" className="size-3" /> : <TriangleAlert aria-hidden="true" className="size-3" />}{attempt.status}</Badge></CardHeader><CardContent><VerificationSteps steps={verificationAttemptSteps(attempt)} compact /></CardContent></Card>;
}

function HeaderMetric({ label, value }: { label: string; value: string }) { return <div className="min-w-28 rounded-lg border bg-card px-3 py-2.5"><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-1 truncate text-xs font-medium capitalize">{value}</p></div>; }
function SectionHeading({ id, icon: Icon, title, description }: { id: string; icon: typeof Timer; title: string; description: string }) { return <div className="mb-3 flex items-start gap-2.5"><span className="mt-0.5 flex size-7 items-center justify-center rounded-md border bg-secondary/50 text-muted-foreground"><Icon aria-hidden="true" className="size-3.5" /></span><div><h2 id={id} className="text-sm font-semibold">{title}</h2><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p></div></div>; }
function EvidenceItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className={cn("mt-2 text-sm leading-6", mono && "font-mono text-xs")}>{value}</p></div>; }
function Score({ label, value }: { label: string; value: number | null }) { const percentage = value === null ? null : Math.round(value * 100); return <div><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="font-mono font-medium">{percentage === null ? "—" : `${percentage}%`}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-foreground/70" style={{ width: `${percentage ?? 0}%` }} /></div></div>; }
function PerformanceMetric({ label, value }: { label: string; value: string }) { return <div className="border-b border-r p-4 last:border-r-0"><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-1.5 truncate font-mono text-xs font-medium">{value}</p></div>; }
function StateCard({ title, description }: { title: string; description: string }) { return <Card><CardContent className="flex items-start gap-3 py-5"><Clock3 aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" /><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div></CardContent></Card>; }
function ErrorCard({ title, code }: { title: string; code: string | null }) { const presentation = getWorkerErrorPresentation(code); return <Card className="border-danger/25"><CardContent className="flex items-start gap-3 py-5"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 text-danger-foreground" /><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{presentation.message}</p><p className="mt-1 text-xs leading-5 text-muted-foreground"><span className="font-medium text-foreground">Next step:</span> {presentation.action}</p>{code ? <code className="mt-2 block text-[11px] text-danger-foreground">{code}</code> : null}</div></CardContent></Card>; }
function formatLabel(value: string) { return value.replace(/_ms$/, "").split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function skipMessage(reason: string | null) { return ({ not_terraform_change: "No configured Terraform file changed.", workflow_not_configured: "The failed workflow did not match the configured Terraform workflow names.", repository_not_ready: "GitHub, repository configuration, agent state, or AWS readiness changed before execution.", trigger_disabled: "The matching event or failed stage is disabled in repository settings.", fork_pr_untrusted: "Untrusted fork pull requests are never executed with customer AWS credentials.", not_terraform_failure: "No bounded Terraform validate or plan failure was found in the job log." } as Record<string, string>)[reason ?? ""] ?? "The event did not pass the hosted execution safety gates."; }
function publicationDescription(publication: RunDetail["publication"], hasPullRequest: boolean) {
  if (!hasPullRequest) return "Not applicable: direct-push runs remain available in the dashboard and never create a pull request.";
  if (!publication) return "No publication has been queued for this completed run yet.";
  if (publication.status === "published") return "One marked GitHub App comment contains the latest safe diagnosis for this pull request.";
  if (publication.status === "pending" || publication.status === "publishing") return "The worker will publish or update the existing marked bot comment without rerunning diagnosis.";
  if (publication.status === "failed") return publication.errorMessage ?? "GitHub could not publish this diagnosis. Fix the reported permission or installation issue, then republish.";
  return publication.skipReason === "superseded_by_newer_run" ? "Skipped because a newer completed run owns the current pull-request comment." : "This run is not eligible for pull-request publication.";
}
