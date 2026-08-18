import Link from "next/link";
import { ArrowRight, CircleDotDashed, FolderCheck, FolderGit2, GitPullRequestArrow, Github, Power } from "lucide-react";
import { beginGitHubInstallationAction } from "@/app/actions/github";
import { ConnectedRepositoryCard } from "@/components/connected-repository-card";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getDashboardSummary } from "@/lib/data/dashboard";
import { listInstallationsForUser } from "@/lib/github/installations";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireAuthenticatedUser();
  const [summary, userInstallations] = await Promise.all([
    getDashboardSummary(user.id),
    listInstallationsForUser(user.id),
  ]);
  const repositories = userInstallations.flatMap(({ githubInstallation }) =>
    githubInstallation.repositories.map((repository) => ({ repository, accountLogin: githubInstallation.accountLogin })),
  );
  const metrics = [
    { title: "Connected", value: String(summary.connectedCount), description: `${summary.installationCount} GitHub installation${summary.installationCount === 1 ? "" : "s"}`, icon: FolderGit2 },
    { title: "Configured", value: String(summary.configuredCount), description: "Repositories with saved agent settings", icon: FolderCheck },
    { title: "Enabled", value: String(summary.enabledCount), description: "Configured for future execution", icon: Power },
    { title: "Requiring AWS", value: String(summary.requiringAwsCount), description: "Enabled but not operationally ready", icon: CircleDotDashed },
  ];

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Control plane</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Terraform failure intelligence</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">Connect repositories and persist their Terraform agent settings. Execution and AWS verification access remain intentionally inactive.</p>
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
            <p className="mt-1 text-xs text-muted-foreground">Real run records will appear after the execution pipeline is connected in a later phase.</p>
          </div>
          <span className="text-xs text-muted-foreground">0 persisted runs</span>
        </div>
        <Card><CardContent className="p-0"><EmptyState icon={GitPullRequestArrow} title="No agent runs yet" description="Phase 3 persists execution configuration only. Terraform execution and result ingestion are deferred." /></CardContent></Card>
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
