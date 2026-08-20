import { Ban, CheckCircle2, CircleDotDashed, Clock3, LoaderCircle, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RunStatus } from "@/lib/runs/types";
import { cn } from "@/lib/utils";

const statusConfig = {
  queued: { label: "Queued", icon: Clock3, className: "border-border bg-neutral-status-muted text-neutral-status" },
  running: { label: "Running", icon: LoaderCircle, className: "border-warning/20 bg-warning-muted text-warning-foreground" },
  completed: { label: "Completed", icon: CheckCircle2, className: "border-success/20 bg-success-muted text-success-foreground" },
  failed: { label: "Failed", icon: TriangleAlert, className: "border-danger/20 bg-danger-muted text-danger-foreground" },
  skipped: { label: "Skipped", icon: CircleDotDashed, className: "border-border bg-neutral-status-muted text-neutral-status" },
  cancelled: { label: "Cancelled", icon: Ban, className: "border-border bg-neutral-status-muted text-neutral-status" },
} satisfies Record<RunStatus, { label: string; icon: typeof Clock3; className: string }>;

export function RunStatusBadge({ status, className }: { status: RunStatus; className?: string }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return <Badge variant="outline" className={cn(config.className, className)}><Icon aria-hidden="true" className={cn("size-3", status === "running" && "animate-spin")} />{config.label}</Badge>;
}
