import { Check, Minus, X } from "lucide-react";
import type { StageStatus, VerificationStep } from "@/lib/types";
import { cn } from "@/lib/utils";

const stageStyles: Record<StageStatus, { icon: typeof Check; shell: string; text: string }> = {
  passed: { icon: Check, shell: "border-success/25 bg-success-muted text-success-foreground", text: "Passed" },
  failed: { icon: X, shell: "border-danger/25 bg-danger-muted text-danger-foreground", text: "Failed" },
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
              <span className={cn("flex size-5 items-center justify-center rounded-full border", config.shell)} title={config.text}>
                <Icon aria-hidden="true" className="size-3" />
                <span className="sr-only">{config.text}</span>
              </span>
            </div>
            {!compact && step.detail ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.detail}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
