import { AlertTriangle, Check, Clock3, RotateCcw, ShieldX, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/constants";
import type { VerificationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const statusStyles: Record<VerificationStatus, string> = {
  verified_first_attempt: "border-success/20 bg-success-muted text-success-foreground",
  verified_after_retry: "border-warning/20 bg-warning-muted text-warning-foreground",
  verification_failed: "border-danger/20 bg-danger-muted text-danger-foreground",
  patch_rejected: "border-danger/20 bg-danger-muted text-danger-foreground",
  verification_unavailable: "border-border bg-neutral-status-muted text-neutral-status",
  pending: "border-border bg-neutral-status-muted text-neutral-status",
};

const statusIcons = {
  verified_first_attempt: Check,
  verified_after_retry: RotateCcw,
  verification_failed: X,
  patch_rejected: ShieldX,
  verification_unavailable: AlertTriangle,
  pending: Clock3,
} satisfies Record<VerificationStatus, typeof Check>;

export function StatusBadge({ status, compact = false, className }: { status: VerificationStatus; compact?: boolean; className?: string }) {
  const Icon = statusIcons[status];
  return (
    <Badge className={cn(statusStyles[status], className)} variant="outline">
      <Icon aria-hidden="true" className="size-3" />
      <span>{compact && status === "verified_first_attempt" ? "Verified" : STATUS_LABELS[status]}</span>
    </Badge>
  );
}
