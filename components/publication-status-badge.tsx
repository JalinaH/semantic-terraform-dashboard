import { Badge } from "@/components/ui/badge";
import type { PublicationStatus } from "@/lib/publication/types";
import { cn } from "@/lib/utils";

export function PublicationStatusBadge({ status }: { status: PublicationStatus }) {
  const labels: Record<PublicationStatus, string> = {
    pending: "Pending",
    publishing: "Publishing",
    published: "Published",
    failed: "Failed",
    skipped: "Not applicable",
  };
  return <Badge variant="outline" className={cn(
    "whitespace-nowrap",
    status === "published" && "border-success/25 bg-success-muted text-success-foreground",
    status === "failed" && "border-danger/25 bg-danger-muted text-danger-foreground",
    (status === "pending" || status === "publishing") && "border-warning/25 bg-warning-muted text-warning-foreground",
  )}>{labels[status]}</Badge>;
}
