import Link from "next/link";
import { ArrowRight, BadgeCheck, BrainCircuit, CircleDollarSign, CircleGauge, FolderGit2, GitPullRequestArrow, Github, ListChecks, Sparkles } from "lucide-react";
import { beginGitHubInstallationAction } from "@/app/actions/github";
import { ConnectedRepositoryCard } from "@/components/connected-repository-card";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { RunPoller } from "@/components/run-poller";
import { RunsTable } from "@/components/runs-table";
import { UsagePeriodSwitcher } from "@/components/usage-period-switcher";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { listAgentRunsForUser } from "@/lib/data/runs";
import { formatCompactTokens, formatPercent, formatUsd } from "@/lib/analytics/format";
import { getUsageAnalyticsForUser, parseUsagePeriod } from "@/lib/analytics/usage";
import { listInstallationsForUser } from "@/lib/github/installations";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, params] = await Promise.all([requireAuthenticatedUser(), searchParams]);
  const period = parseUsagePeriod(single(params.period));
  const [usage, recentRuns, userInstallations] = await Promise.all([
    getUsageAnalyticsForUser(user.id, period),
    listAgentRunsForUser(user.id, {}, 5),
    listInstallationsForUser(user.id),
  ]);
  const repositories = userInstallations.flatMap(({ githubInstallation }) =>
    githubInstallation.repositories.map((repository) => ({ repository, accountLogin: githubInstallation.accountLogin })),
  );
  const metrics = [
    { title: "Agent runs", value: String(usage.runCount), description: "Real persisted webhook-triggered records", icon: ListChecks },
    { title: "Verified fixes", value: String(usage.verifiedFixes), description: "Fresh isolated Terraform verification passed", icon: BadgeCheck },
    { title: "Verification rate", value: formatPercent(usage.verificationRate), description: "Verified / completed diagnosable runs", icon: CircleGauge },
    { title: "AI spend", value: formatUsd(usage.aiSpendUsd), description: `${usage.costCompleteRuns} of ${usage.completedRunCount} completed diagnoses reported complete cost`, icon: CircleDollarSign },
  ];
  const secondaryMetrics = [
    { title: "Total tokens", value: formatCompactTokens(usage.totalTokens), description: `${usage.tokenCompleteRuns} of ${usage.completedRunCount} completed diagnoses`, icon: Sparkles },
    { title: "Average tokens / run", value: usage.averageTokensPerRun === null ? "Not enough data" : formatCompactTokens(Math.round(usage.averageTokensPerRun)), description: "Shown only with complete selected token data", icon: BrainCircuit },
    { title: "Average cost / run", value: usage.averageCostPerRunUsd === null ? "Not enough data" : formatUsd(usage.averageCostPerRunUsd), description: "Shown only with complete selected cost data", icon: CircleDollarSign },
    { title: "Cost / verified fix", value: usage.costPerVerifiedFixUsd === null ? "Not enough complete cost data" : formatUsd(usage.costPerVerifiedFixUsd), description: "Complete cost divided by verified fixes", icon: BadgeCheck },
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
        <div className="flex flex-col items-start gap-2 sm:items-end"><UsagePeriodSwitcher period={period} path="/dashboard" />{repositories.length ? (
          <Link href="/repositories" className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>Manage repositories <ArrowRight aria-hidden="true" /></Link>
        ) : (
          <form action={beginGitHubInstallationAction}>
            <input type="hidden" name="returnTo" value="/repositories" />
            <Button type="submit"><Github aria-hidden="true" />Install GitHub App</Button>
          </form>
        )}</div>
      </section>

      {usage.runCount ? <section aria-labelledby="usage-secondary-heading"><h2 id="usage-secondary-heading" className="mb-3 text-sm font-semibold">Usage efficiency</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{secondaryMetrics.map((metric) => <MetricCard key={metric.title} {...metric} />)}</div></section> : <EmptyState icon={BrainCircuit} title="No usage data yet" description="TerraFix will show token usage, model cost, and optimization metrics after your first diagnosis." />}

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
            description="Install the GitHub App on a personal account or organization, then select the repositories TerraFix may access."
            action={<form action={beginGitHubInstallationAction}><input type="hidden" name="returnTo" value="/repositories" /><Button type="submit" size="sm"><Github aria-hidden="true" />Install GitHub App</Button></form>}
          />
        )}
      </section>
    </div>
  );
}

function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
