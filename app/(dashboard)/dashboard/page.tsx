import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, FolderGit2, Gauge } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { RepositoryCard } from "@/components/repository-card";
import { RunsTable } from "@/components/runs-table";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dashboardMetrics, repositories, runs } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const metricIcons = [FolderGit2, Activity, CheckCircle2, Gauge];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Control plane</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Terraform failure intelligence</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">Monitor evidence-backed diagnoses and isolated verification outcomes across your connected repositories.</p>
        </div>
        <Link href="/runs" className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>View all runs <ArrowRight aria-hidden="true" /></Link>
      </section>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">Workspace summary</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {dashboardMetrics.map((metric, index) => <MetricCard key={metric.title} {...metric} icon={metricIcons[index]} />)}
        </div>
      </section>

      <section aria-labelledby="recent-runs-heading">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 id="recent-runs-heading" className="text-base font-semibold">Recent runs</h2>
            <p className="mt-1 text-xs text-muted-foreground">Latest diagnoses from configured repositories.</p>
          </div>
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex"><span className="size-1.5 rounded-full bg-success" />Mock preview data</span>
        </div>
        <Card className="overflow-hidden"><RunsTable runs={runs.slice(0, 4)} /></Card>
      </section>

      <section aria-labelledby="health-heading">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 id="health-heading" className="text-base font-semibold">Repository health</h2>
            <p className="mt-1 text-xs text-muted-foreground">Configuration and last verification state.</p>
          </div>
          <Link href="/repositories" className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">Manage repositories</Link>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {repositories.slice(0, 3).map((repository) => <RepositoryCard key={repository.id} repository={repository} />)}
        </div>
      </section>
    </div>
  );
}
