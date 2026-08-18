import Link from "next/link";
import { ArrowUpRight, GitBranch, Lock, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface ConnectedRepositoryCardProps {
  repository: {
    id: string;
    fullName: string;
    defaultBranch: string;
    private: boolean;
    archived: boolean;
    config: { enabled: boolean } | null;
  };
  accountLogin: string;
}

export function ConnectedRepositoryCard({ repository, accountLogin }: ConnectedRepositoryCardProps) {
  return (
    <Card className="group min-w-0 transition-colors hover:border-foreground/20">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="min-w-0">
          <Link
            href={`/repositories/${repository.id}`}
            className="inline-flex max-w-full items-center gap-1 text-sm font-semibold hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span className="truncate">{repository.fullName}</span>
            <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">Granted through {accountLogin}</p>
        </div>
        {repository.private ? (
          <Badge variant="outline"><Lock aria-hidden="true" className="size-3" />Private</Badge>
        ) : (
          <Badge variant="outline">Public</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="flex items-center justify-between gap-4 rounded-md bg-secondary/40 px-3 py-2.5 text-xs">
          <span className="inline-flex items-center gap-2 text-muted-foreground"><GitBranch aria-hidden="true" className="size-3.5" />Default branch</span>
          <span className="truncate font-mono font-medium">{repository.defaultBranch}</span>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-md bg-secondary/40 px-3 py-2.5 text-xs">
          <span className="inline-flex items-center gap-2 text-muted-foreground"><Settings2 aria-hidden="true" className="size-3.5" />Agent configuration</span>
          <span className="font-medium text-neutral-status">
            {repository.config ? (repository.config.enabled ? "Configured" : "Disabled") : "Not configured"}
          </span>
        </div>
        {repository.archived ? <p className="text-xs text-warning-foreground">This repository is archived on GitHub.</p> : null}
      </CardContent>
    </Card>
  );
}
