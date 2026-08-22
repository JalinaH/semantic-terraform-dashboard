import { CircleHelp } from "lucide-react";

export function DataCompleteness({ tokens, costs, total }: { tokens: number; costs: number; total: number }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-secondary/25 px-3 py-2 text-xs text-muted-foreground" aria-label="Data completeness">
    <span className="inline-flex items-center gap-1.5 font-medium text-foreground"><CircleHelp aria-hidden="true" className="size-3.5" />Data completeness</span>
    <span>Token telemetry <strong className="font-medium text-foreground">{tokens} / {total}</strong> diagnoses</span>
    <span>Cost telemetry <strong className="font-medium text-foreground">{costs} / {total}</strong> diagnoses</span>
  </div>;
}
