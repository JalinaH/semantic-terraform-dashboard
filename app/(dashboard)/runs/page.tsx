import { CalendarDays, Filter, GitPullRequestArrow, Search } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageIntro } from "@/components/page-intro";
import { RunPoller } from "@/components/run-poller";
import { RunsTable } from "@/components/runs-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { listAgentRunsForUser, listRunModelsForUser, type RunFilters } from "@/lib/data/runs";
import { listInstallationsForUser } from "@/lib/github/installations";
import type { RunStatus, RunVerificationStatus } from "@/lib/runs/types";

export const dynamic = "force-dynamic";

const runStatuses: RunStatus[] = ["queued", "running", "completed", "failed", "skipped", "cancelled"];
const verificationStatuses: RunVerificationStatus[] = ["verified_first_attempt", "verified_after_retry", "verification_failed", "patch_rejected", "verification_unavailable", "verification_skipped", "pending"];

export default async function RunsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAuthenticatedUser();
  const params = await searchParams;
  const statusValue = single(params.status);
  const verificationValue = single(params.verification);
  const filters: RunFilters = {
    repositoryId: single(params.repository) || undefined,
    status: runStatuses.includes(statusValue as RunStatus) ? statusValue as RunStatus : undefined,
    resource: single(params.resource) || undefined,
    date: single(params.date) || undefined,
    verificationStatus: verificationStatuses.includes(verificationValue as RunVerificationStatus) ? verificationValue as RunVerificationStatus : undefined,
    model: single(params.model) || undefined,
    modelEscalated: optionalBoolean(params.modelEscalated),
    contextEscalated: optionalBoolean(params.contextEscalated),
    memoryReused: optionalBoolean(params.memoryReused),
    zeroLlm: optionalBoolean(params.zeroLlm),
    schemaAvoided: optionalBoolean(params.schemaAvoided),
    resolutionSource: single(params.resolutionSource) || undefined,
  };
  const [installations, runs, models] = await Promise.all([
    listInstallationsForUser(user.id),
    listAgentRunsForUser(user.id, filters),
    listRunModelsForUser(user.id),
  ]);
  const repositories = installations.flatMap(({ githubInstallation }) => githubInstallation.repositories);
  const active = runs.some((run) => run.status === "queued" || run.status === "running");

  return (
    <div className="space-y-8">
      <RunPoller active={active} />
      <PageIntro eyebrow="Evidence history" title="Agent runs" description="Hosted webhook-triggered diagnoses and isolated verification outcomes. Orchestration and verification are reported separately." />

      {hasAnalyticsDrilldown(filters) ? <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-secondary/25 px-4 py-3 text-xs"><span className="font-medium">Analytics drilldown</span>{drilldownLabels(filters).map((label) => <span key={label} className="rounded border bg-background px-2 py-1 text-muted-foreground">{label}</span>)}<Link href="/runs" className="ml-auto font-medium text-primary hover:underline">Clear drilldown</Link></div> : null}

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium"><Filter aria-hidden="true" className="size-3.5 text-muted-foreground" />Filters</div>
          <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
            <FilterField label="Repository" htmlFor="filter-repository"><Select id="filter-repository" name="repository" defaultValue={filters.repositoryId ?? ""}><option value="">All repositories</option>{repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.fullName}</option>)}</Select></FilterField>
            <FilterField label="Run status" htmlFor="filter-status"><Select id="filter-status" name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option>{runStatuses.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}</Select></FilterField>
            <FilterField label="Verification" htmlFor="filter-verification"><Select id="filter-verification" name="verification" defaultValue={filters.verificationStatus ?? ""}><option value="">All verification outcomes</option>{verificationStatuses.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}</Select></FilterField>
            <FilterField label="Model" htmlFor="filter-model"><Select id="filter-model" name="model" defaultValue={filters.model ?? ""}><option value="">All models</option>{models.map((model) => <option key={model} value={model}>{model}</option>)}</Select></FilterField>
            <FilterField label="Resource" htmlFor="filter-resource"><div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input id="filter-resource" name="resource" defaultValue={filters.resource} placeholder="aws_…" className="pl-9 font-mono text-xs" /></div></FilterField>
            <FilterField label="Since date" htmlFor="filter-date"><div className="relative"><CalendarDays aria-hidden="true" className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input id="filter-date" name="date" defaultValue={filters.date} type="date" className="pl-9" /></div></FilterField>
            <Button variant="outline" type="submit" className="xl:col-start-4">Apply</Button>
          </form>
        </CardContent>
      </Card>

      <section aria-labelledby="all-runs-heading">
        <div className="mb-3 flex items-center justify-between"><h2 id="all-runs-heading" className="text-sm font-semibold">All runs</h2><span className="text-xs text-muted-foreground">{runs.length} record{runs.length === 1 ? "" : "s"}</span></div>
        {runs.length ? <Card><CardContent className="p-0"><RunsTable runs={runs} /></CardContent></Card> : <EmptyState icon={GitPullRequestArrow} title="No matching agent runs" description="Runs appear after a configured Terraform workflow fails and the GitHub webhook passes readiness and safety checks." />}
      </section>
    </div>
  );
}

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={htmlFor} className="text-muted-foreground">{label}</Label>{children}</div>;
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatLabel(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function optionalBoolean(value: string | string[] | undefined) {
  const normalized = single(value);
  return normalized === "true" ? true : normalized === "false" ? false : undefined;
}

function hasAnalyticsDrilldown(filters: RunFilters) {
  return filters.modelEscalated !== undefined || filters.contextEscalated !== undefined || filters.memoryReused !== undefined || filters.zeroLlm !== undefined || filters.schemaAvoided !== undefined || Boolean(filters.resolutionSource);
}

function drilldownLabels(filters: RunFilters) {
  return [
    filters.modelEscalated !== undefined ? `Model escalated: ${filters.modelEscalated ? "Yes" : "No"}` : null,
    filters.contextEscalated !== undefined ? `Context escalated: ${filters.contextEscalated ? "Yes" : "No"}` : null,
    filters.memoryReused !== undefined ? `Memory reused: ${filters.memoryReused ? "Yes" : "No"}` : null,
    filters.zeroLlm !== undefined ? `Zero LLM: ${filters.zeroLlm ? "Yes" : "No"}` : null,
    filters.schemaAvoided !== undefined ? `Schema avoided: ${filters.schemaAvoided ? "Yes" : "No"}` : null,
    filters.resolutionSource ? `Resolution: ${formatLabel(filters.resolutionSource)}` : null,
  ].filter((value): value is string => Boolean(value));
}
