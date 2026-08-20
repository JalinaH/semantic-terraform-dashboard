import Link from "next/link";
import { ArrowRight, BadgeCheck, CircleGauge, FolderGit2, GitPullRequestArrow, Github, ListChecks, TriangleAlert } from "lucide-react";
import { beginGitHubInstallationAction } from "@/app/actions/github";
import { ConnectedRepositoryCard } from "@/components/connected-repository-card";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { RunPoller } from "@/components/run-poller";
import { RunsTable } from "@/components/runs-table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getRunMetricsForUser, listAgentRunsForUser } from "@/lib/data/runs";
import { listInstallationsForUser } from "@/lib/github/installations";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireAuthenticatedUser();
  const [runMetrics, recentRuns, userInstallations] = await Promise.all([
    getRunMetricsForUser(user.id),
    listAgentRunsForUser(user.id, {}, 5),
    listInstallationsForUser(user.id),
  ]);
  const repositories = userInstallations.flatMap(({ githubInstallation }) =>
    githubInstallation.repositories.map((repository) => ({ repository, accountLogin: githubInstallation.accountLogin })),
  );
  const metrics = [
    { title: "Total runs", value: String(runMetrics.total), description: "Real persisted webhook-triggered records", icon: ListChecks },
    { title: "Verified fixes", value: String(runMetrics.verified), description: `${runMetrics.verifiedAfterRetry} verified after bounded repair`, icon: BadgeCheck },
    { title: "Verification rate", value: `${runMetrics.verificationRate}%`, description: "Verified fixes across completed diagnoses", icon: CircleGauge },
    { title: "Failed runs", value: String(runMetrics.failed), description: "Worker or infrastructure failures", icon: TriangleAlert },
  ];

  return (
    <div className="space-y-8">
      <RunPoller active={recentRuns.some((run) => run.status === "queued" || run.status === "running")} />
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Control plane</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Terraform failure intelligence</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">Signed GitHub workflow failures are filtered, queued, executed by the hosted Python agent, and persisted as evidence-backed results.</p>
        </div>
        {repositories.length ? (
          <Link href="/repositories" className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>Manage repositories <ArrowRight aria-hidden="true" /></Link>
        ) : (
          <form action={beginGitHubInstallationAction}>
            <input type="hidden" name="returnTo" value="/repositories" />
            <Button type="submit"><Github aria-hidden="true" />Install GitHub App</Button>
          </form>
        )}
      </section>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">Workspace summary</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => <MetricCard key={metric.title} {...metric} />)}
        </div>
      </section>

      <section aria-labelledby="recent-runs-heading">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 id="recent-runs-heading" className="text-base font-semibold">Recent runs</h2>
            <p className="mt-1 text-xs text-muted-foreground">Hosted runs from repositories you can access.</p>
          </div>
          <Link href="/runs" className="text-xs font-medium text-muted-foreground hover:text-foreground">View all</Link>
        </div>
        <Card><CardContent className="p-0">{recentRuns.length ? <RunsTable runs={recentRuns} /> : <EmptyState icon={GitPullRequestArrow} title="No agent runs yet" description="A run will appear when a configured Terraform workflow fails and passes the readiness, changed-file, and fork-safety gates." />}</CardContent></Card>
      </section>

      <section aria-labelledby="repositories-heading">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 id="repositories-heading" className="text-base font-semibold">Connected repositories</h2>
            <p className="mt-1 text-xs text-muted-foreground">Repository access currently granted to the GitHub App.</p>
          </div>
          {repositories.length ? <Link href="/repositories" className="text-xs font-medium text-muted-foreground hover:text-foreground">View all</Link> : null}
        </div>
        {repositories.length ? (
          <div className="grid gap-4 xl:grid-cols-3">
            {repositories.slice(0, 3).map(({ repository, accountLogin }) => <ConnectedRepositoryCard key={repository.id} repository={repository} accountLogin={accountLogin} />)}
          </div>
        ) : (
          <EmptyState
            icon={FolderGit2}
            title="No repositories connected"
            description="Install the GitHub App on a personal account or organization, then select the repositories Semantic Terraform Agent may access."
            action={<form action={beginGitHubInstallationAction}><input type="hidden" name="returnTo" value="/repositories" /><Button type="submit" size="sm"><Github aria-hidden="true" />Install GitHub App</Button></form>}
          />
        )}
      </section>
    </div>
  );
}
