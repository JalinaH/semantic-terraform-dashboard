import { Badge } from "@/components/ui/badge";
import type { AwsConnectionStatus } from "@/lib/aws/types";
import { cn } from "@/lib/utils";

export type DisplayAwsStatus = AwsConnectionStatus | "not_connected";

const labels: Record<DisplayAwsStatus, string> = {
  not_connected: "Not connected",
  pending: "Waiting for role",
  connected: "Connected",
  verification_failed: "Verification failed",
  access_removed: "Access removed",
};

export function AwsStatusBadge({ status }: { status: DisplayAwsStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        status === "connected" && "border-success/20 bg-success-muted text-success-foreground",
        status === "pending" && "border-warning/20 bg-warning-muted text-warning-foreground",
        (status === "verification_failed" || status === "access_removed") && "border-destructive/20 bg-destructive/5 text-destructive",
        status === "not_connected" && "bg-neutral-status-muted text-neutral-status",
      )}
    >
      {labels[status]}
    </Badge>
  );
}
