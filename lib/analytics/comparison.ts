export type MetricComparison = { kind: "percent"; change: number } | { kind: "new" } | null;

export function compareMetric(current: number | null, previous: number | null): MetricComparison {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous) || current < 0 || previous < 0) return null;
  if (previous === 0) return current > 0 ? { kind: "new" } : null;
  return { kind: "percent", change: (current - previous) / previous };
}
