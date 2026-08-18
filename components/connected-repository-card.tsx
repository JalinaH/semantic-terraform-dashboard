import Link from "next/link";
import { ArrowUpRight, FolderCog, GitBranch, Lock, Settings2, TriangleAlert } from "lucide-react";
import { RepositoryConfigStatusBadge } from "@/components/repository-config-status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ConnectedRepositoryCardProps {
  repository: {
    id: string;
    fullName: string;
    defaultBranch: string;
    private: boolean;
    archived: boolean;
    accessible: boolean;
    config: {
      enabled: boolean;
      terraformDir: string;
      model: string;
      contextMode: "AUTO" | "LIGHTWEIGHT" | "SCHEMA_AWARE";
    } | null;
  };
  accountLogin: string;
}

export function ConnectedRepositoryCard({ repository, accountLogin }: ConnectedRepositoryCardProps) {
  const configStatus = repository.config
    ? (repository.config.enabled ? "configured" : "disabled")
    : "not_configured";

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
        <div className="flex flex-wrap justify-end gap-1.5">
          {!repository.accessible ? <Badge variant="outline" className="border-warning/20 bg-warning-muted text-warning-foreground">Access removed</Badge> : null}
          {repository.private ? <Badge variant="outline"><Lock aria-hidden="true" className="size-3" />Private</Badge> : <Badge variant="outline">Public</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="flex items-center justify-between gap-4 rounded-md bg-secondary/40 px-3 py-2.5 text-xs">
          <span className="inline-flex items-center gap-2 text-muted-foreground"><GitBranch aria-hidden="true" className="size-3.5" />Default branch</span>
          <span className="truncate font-mono font-medium">{repository.defaultBranch}</span>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-md bg-secondary/40 px-3 py-2.5 text-xs">
          <span className="inline-flex items-center gap-2 text-muted-foreground"><Settings2 aria-hidden="true" className="size-3.5" />Agent configuration</span>
          <RepositoryConfigStatusBadge status={configStatus} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="min-w-0 rounded-md bg-secondary/40 px-3 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><FolderCog aria-hidden="true" className="size-3.5" />Terraform root</span>
            <p className="mt-1 truncate font-mono font-medium">{repository.config?.terraformDir ?? "—"}</p>
          </div>
          <div className="min-w-0 rounded-md bg-secondary/40 px-3 py-2.5">
            <span className="text-muted-foreground">Model</span>
            <p className="mt-1 truncate font-mono font-medium">{repository.config?.model ?? "—"}</p>
          </div>
        </div>
        {repository.config ? <p className="text-[11px] text-muted-foreground">Context: {formatContext(repository.config.contextMode)}</p> : null}
        {!repository.accessible ? <p className="flex items-center gap-1.5 text-xs text-warning-foreground"><TriangleAlert aria-hidden="true" className="size-3.5" />Configuration is preserved but read-only.</p> : null}
        {repository.archived ? <p className="text-xs text-warning-foreground">This repository is archived on GitHub.</p> : null}
        <Link href={`/repositories/${repository.id}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }), "w-full")}>{repository.accessible ? (repository.config ? "Manage configuration" : "Configure repository") : "View saved configuration"}</Link>
      </CardContent>
    </Card>
  );
}

function formatContext(value: "AUTO" | "LIGHTWEIGHT" | "SCHEMA_AWARE") {
  return value.toLowerCase().replace("_", " ").replace(/^./, (character) => character.toUpperCase());
}
