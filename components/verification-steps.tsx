import { AlertTriangle, Check, CircleHelp, Minus, ShieldX, X } from "lucide-react";
import type { StageStatus, VerificationStep } from "@/lib/types";
import { cn } from "@/lib/utils";

const stageStyles: Record<StageStatus, { icon: typeof Check; shell: string; text: string }> = {
  passed: { icon: Check, shell: "border-success/25 bg-success-muted text-success-foreground", text: "Passed" },
  failed: { icon: X, shell: "border-danger/25 bg-danger-muted text-danger-foreground", text: "Failed" },
  rejected: { icon: ShieldX, shell: "border-danger/25 bg-danger-muted text-danger-foreground", text: "Rejected" },
  not_run: { icon: Minus, shell: "border-border bg-neutral-status-muted text-neutral-status", text: "Not run" },
  unavailable: { icon: AlertTriangle, shell: "border-warning/25 bg-warning-muted text-warning-foreground", text: "Unavailable" },
  unknown: { icon: CircleHelp, shell: "border-border bg-neutral-status-muted text-neutral-status", text: "Unknown" },
  skipped: { icon: Minus, shell: "border-border bg-neutral-status-muted text-neutral-status", text: "Skipped" },
};

export function VerificationSteps({ steps, compact = false }: { steps: VerificationStep[]; compact?: boolean }) {
  return (
    <ol className={cn("grid gap-3", compact ? "sm:grid-cols-3 xl:grid-cols-6" : "sm:grid-cols-2 xl:grid-cols-3")}>
      {steps.map((step) => {
        const config = stageStyles[step.status];
        const Icon = config.icon;
        return (
          <li key={step.name} className="rounded-lg border bg-card p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium">{step.label}</span>
              <span className={cn("inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium", config.shell)} title={config.text}>
                <Icon aria-hidden="true" className="size-3" />
                <span>{config.text}</span>
              </span>
            </div>
            {!compact && step.detail ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.detail}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
