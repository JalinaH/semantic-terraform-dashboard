import Link from "next/link";
import { ArrowUpRight, Cloud, FolderGit2, Power, Waypoints } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Repository } from "@/lib/types";
import { cn, formatRelativeDate } from "@/lib/utils";

const awsLabels = {
  connected: "AWS connected",
  attention: "AWS needs attention",
  not_connected: "AWS not connected",
};

export function RepositoryCard({ repository, detailed = false }: { repository: Repository; detailed?: boolean }) {
  return (
    <Card className="group min-w-0 transition-colors hover:border-foreground/20">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-secondary/50 text-muted-foreground">
            <FolderGit2 aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <Link href={`/repositories/${repository.id}`} className="group/link inline-flex max-w-full items-center gap-1 text-sm font-semibold hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2">
              <span className="truncate">{repository.fullName}</span>
              <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/link:opacity-100" />
            </Link>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{repository.terraformDir}</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn("shrink-0", repository.enabled ? "border-success/20 bg-success-muted text-success-foreground" : "bg-neutral-status-muted text-neutral-status")}
        >
          <Power aria-hidden="true" className="size-3" />
          {repository.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className={cn("grid gap-3 text-xs", detailed ? "grid-cols-2" : "grid-cols-1") }>
          {detailed ? (
            <>
              <Detail label="Model" value={repository.model} />
              <Detail label="Context" value={repository.contextMode} capitalize />
            </>
          ) : null}
          <div className="col-span-full flex items-center justify-between gap-4 rounded-md bg-secondary/40 px-3 py-2.5">
            <span className="inline-flex items-center gap-2 text-muted-foreground"><Cloud aria-hidden="true" className="size-3.5" />AWS</span>
            <span className={cn("font-medium", repository.awsStatus === "connected" ? "text-success-foreground" : repository.awsStatus === "attention" ? "text-warning-foreground" : "text-neutral-status")}>{awsLabels[repository.awsStatus]}</span>
          </div>
          <div className="col-span-full flex items-center justify-between gap-4 rounded-md bg-secondary/40 px-3 py-2.5">
            <span className="inline-flex items-center gap-2 text-muted-foreground"><Waypoints aria-hidden="true" className="size-3.5" />Last run</span>
            {repository.lastRunStatus ? <StatusBadge status={repository.lastRunStatus} compact /> : <span className="text-muted-foreground">No runs yet</span>}
          </div>
        </div>
        {detailed ? <p className="mt-3 text-xs text-muted-foreground">Last analyzed {repository.lastAnalyzed ? formatRelativeDate(repository.lastAnalyzed) : "—"}</p> : null}
      </CardContent>
    </Card>
  );
}

function Detail({ label, value, capitalize = false }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="rounded-md border px-3 py-2.5">
      <p className="text-muted-foreground">{label}</p>
      <p className={cn("mt-1 truncate font-medium", capitalize && "capitalize")}>{value}</p>
    </div>
  );
}
