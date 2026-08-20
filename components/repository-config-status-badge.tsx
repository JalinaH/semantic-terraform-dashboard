import { Badge } from "@/components/ui/badge";
import type { RepositoryConfigStatus } from "@/lib/repository-config/types";
import { cn } from "@/lib/utils";

const labels: Record<RepositoryConfigStatus, string> = {
  not_configured: "Not configured",
  configured: "Configured",
  ready: "Ready",
  disabled: "Disabled",
};

export function RepositoryConfigStatusBadge({ status }: { status: RepositoryConfigStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        status === "configured" && "border-warning/20 bg-warning-muted text-warning-foreground",
        status === "ready" && "border-success/20 bg-success-muted text-success-foreground",
        status === "disabled" && "bg-neutral-status-muted text-neutral-status",
        status === "not_configured" && "border-warning/20 bg-warning-muted text-warning-foreground",
      )}
    >
      {labels[status]}
    </Badge>
  );
}
