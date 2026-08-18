import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FileCode2,
  GitCommitHorizontal,
  GitPullRequest,
  ShieldCheck,
  Sparkles,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { DiffViewer } from "@/components/diff-viewer";
import { StatusBadge } from "@/components/status-badge";
import { VerificationSteps } from "@/components/verification-steps";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getRun, runs } from "@/lib/mock-data";
import { cn, formatDate, formatRuntime, truncateSha } from "@/lib/utils";

export function generateStaticParams() {
  return runs.map((run) => ({ id: run.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const run = getRun(id);
  if (!run) return { title: "Run not found" };
  const title = `${run.affectedResource} · ${run.id}`;
  const description = `Diagnosis and verification evidence for ${run.repositoryFullName}.`;
  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { title, description, images: [] },
  };
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) notFound();

  return (
    <div className="space-y-7">
      <div role="status" className="rounded-lg border border-warning/20 bg-warning-muted px-4 py-3 text-xs leading-5 text-warning-foreground"><span className="font-medium">Visualization sample.</span> This Phase 1 result is typed mock data, not an ingested run from your connected repositories.</div>
      <header>
        <Link href="/runs" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-3 text-muted-foreground")}><ArrowLeft aria-hidden="true" />Agent runs</Link>
        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{run.id}</span>
              <StatusBadge status={run.verificationStatus} />
            </div>
            <h2 className="mt-3 truncate font-mono text-xl font-semibold tracking-[-0.025em] sm:text-2xl">{run.affectedResource}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <Link href={`/repositories/${run.repositoryId}`} className="font-medium text-foreground hover:underline">{run.repositoryFullName}</Link>
              <span className="inline-flex items-center gap-1.5">{run.pullRequestNumber ? <GitPullRequest aria-hidden="true" className="size-3.5" /> : <GitCommitHorizontal aria-hidden="true" className="size-3.5" />}{run.pullRequestNumber ? `PR #${run.pullRequestNumber}` : truncateSha(run.commitSha)}</span>
              <span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" className="size-3.5" />{formatDate(run.createdAt)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <HeaderMetric label="Failed stage" value={run.failedStage} />
            <HeaderMetric label="Context" value={run.contextMode} />
            <HeaderMetric label="Runtime" value={formatRuntime(run.totalRuntimeMs)} />
          </div>
        </div>
      </header>

      <section aria-labelledby="diagnosis-heading">
        <SectionHeading icon={BrainCircuit} title="Diagnosis" description="Structured reasoning derived from the bounded failure context." />
        <div className="grid gap-4 xl:grid-cols-[1.5fr_0.7fr]">
          <Card>
            <CardContent className="grid gap-5 pt-5">
              <EvidenceItem label="Root cause" value={run.diagnosis.rootCause} />
              <EvidenceItem label="Violated constraint" value={run.diagnosis.violatedConstraint} mono />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Affected resources</p>
                <div className="mt-2 flex flex-wrap gap-2">{run.diagnosis.affectedResources.map((resource) => <Badge key={resource} variant="outline" className="font-mono">{resource}</Badge>)}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Evidence quality</CardTitle><CardDescription>Mock scores emitted with the safe result payload.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <Score label="Model confidence" value={run.diagnosis.modelConfidence} />
              <Score label="Evidence score" value={run.diagnosis.evidenceScore} />
              <div className="rounded-lg border bg-success-muted p-3 text-xs leading-5 text-success-foreground"><ShieldCheck aria-hidden="true" className="mr-1.5 inline size-3.5" />Evidence is shown for review; it does not auto-merge a change.</div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="patch-heading">
        <SectionHeading icon={FileCode2} title="Suggested patch" description="Candidate unified diff generated within the diagnosed Terraform boundary." />
        <DiffViewer diff={run.suggestedPatch} />
      </section>

      <section aria-labelledby="verification-heading">
        <SectionHeading icon={CheckCircle2} title="Verification" description="Ordered checks executed in an isolated Terraform workspace." />
        <VerificationSteps steps={run.verificationSteps} />
      </section>

      <section aria-labelledby="attempts-heading">
        <SectionHeading icon={Sparkles} title="Attempt history" description="One initial candidate and, when allowed, one bounded repair attempt." />
        {run.attempts.length ? (
          <div className="space-y-4">
            {run.attempts.map((attempt) => (
              <Card key={attempt.attempt} className={cn(attempt.status === "verified" && "border-success/25")}>
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                  <div className="flex items-start gap-3">
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold", attempt.status === "verified" ? "border-success/25 bg-success-muted text-success-foreground" : "border-danger/25 bg-danger-muted text-danger-foreground")}>{attempt.attempt}</span>
                    <div><CardTitle>{attempt.title}</CardTitle><CardDescription className="mt-1">{attempt.summary}</CardDescription></div>
                  </div>
                  <Badge variant="outline" className={cn("capitalize", attempt.status === "verified" ? "border-success/25 bg-success-muted text-success-foreground" : "border-danger/25 bg-danger-muted text-danger-foreground")}>{attempt.status === "verified" ? <CheckCircle2 aria-hidden="true" className="size-3" /> : <TriangleAlert aria-hidden="true" className="size-3" />}{attempt.status}</Badge>
                </CardHeader>
                <CardContent>
                  {attempt.failureReason ? <p className="mb-4 rounded-md border border-danger/20 bg-danger-muted px-3 py-2 text-xs text-danger-foreground">{attempt.failureReason}</p> : null}
                  <VerificationSteps steps={attempt.steps} compact />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card><CardContent className="py-8 text-sm text-muted-foreground">No patch attempt was permitted for this run.</CardContent></Card>
        )}
      </section>

      <section aria-labelledby="performance-heading">
        <SectionHeading icon={Timer} title="Performance" description="Phase timing and token usage, presented without graphs." />
        <Card>
          <CardContent className="grid gap-px overflow-hidden p-0 sm:grid-cols-2 lg:grid-cols-4">
            <PerformanceMetric label="Collection time" value={formatRuntime(run.performance.collectionMs)} />
            <PerformanceMetric label="Schema time" value={formatRuntime(run.performance.schemaMs)} />
            <PerformanceMetric label="LLM time" value={formatRuntime(run.performance.llmMs)} />
            <PerformanceMetric label="Verification time" value={formatRuntime(run.performance.verificationMs)} />
            <PerformanceMetric label="Total time" value={formatRuntime(run.performance.totalMs)} emphasis />
            <PerformanceMetric label="Input tokens" value={run.performance.inputTokens.toLocaleString()} />
            <PerformanceMetric label="Output tokens" value={run.performance.outputTokens.toLocaleString()} />
            <PerformanceMetric label="Model" value="Gemini" />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-28 rounded-lg border bg-card px-3 py-2.5"><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-1 truncate text-xs font-medium capitalize">{value}</p></div>;
}

function SectionHeading({ icon: Icon, title, description }: { icon: typeof Timer; title: string; description: string }) {
  return <div className="mb-3 flex items-start gap-2.5"><span className="mt-0.5 flex size-7 items-center justify-center rounded-md border bg-secondary/50 text-muted-foreground"><Icon aria-hidden="true" className="size-3.5" /></span><div><h2 id={`${title.toLowerCase().replace(" ", "-")}-heading`} className="text-sm font-semibold">{title}</h2><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p></div></div>;
}

function EvidenceItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className={cn("mt-2 text-sm leading-6", mono && "font-mono text-xs")}>{value}</p></div>;
}

function Score({ label, value }: { label: string; value: number }) {
  const percentage = Math.round(value * 100);
  return <div><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="font-mono font-medium">{percentage}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-success" style={{ width: `${percentage}%` }} /></div></div>;
}

function PerformanceMetric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="border-b border-r p-4 last:border-b-0"><p className="text-[11px] text-muted-foreground">{label}</p><p className={cn("mt-2 font-mono text-sm font-medium", emphasis && "text-success-foreground")}>{value}</p></div>;
}
