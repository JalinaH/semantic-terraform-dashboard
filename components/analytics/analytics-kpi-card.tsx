import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { MetricComparison } from "@/lib/analytics/comparison";
import { ComparisonIndicator } from "./comparison-indicator";

export function AnalyticsKpiCard({ title, value, description, icon: Icon, comparison }: { title: string; value: string; description: string; icon: LucideIcon; comparison?: MetricComparison }) {
  return <Card><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">{title}</p><p className="mt-2 font-mono text-2xl font-semibold tracking-tight">{value}</p></div><span className="rounded-md border bg-secondary/40 p-2 text-muted-foreground"><Icon aria-hidden="true" className="size-4" /></span></div><ComparisonIndicator comparison={comparison ?? null} /><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{description}</p></CardContent></Card>;
}
