import type { MetricComparison } from "@/lib/analytics/comparison";

export function ComparisonIndicator({ comparison, label = "vs previous period" }: { comparison: MetricComparison; label?: string }) {
  if (!comparison) return null;
  if (comparison.kind === "new") return <p className="mt-2 text-xs text-muted-foreground">New activity {label}</p>;
  const direction = comparison.change > 0 ? "↑" : comparison.change < 0 ? "↓" : "→";
  return <p className="mt-2 text-xs text-muted-foreground"><span aria-hidden="true">{direction} </span>{Math.abs(comparison.change * 100).toFixed(1)}% {label}</p>;
}
