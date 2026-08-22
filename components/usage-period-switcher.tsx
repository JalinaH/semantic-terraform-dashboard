import Link from "next/link";
import type { UsagePeriod } from "@/lib/analytics/usage";
import { cn } from "@/lib/utils";

const periods: Array<{ value: UsagePeriod; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

export function UsagePeriodSwitcher({ period, path }: { period: UsagePeriod; path: string }) {
  return <nav aria-label="Usage period" className="inline-flex w-fit rounded-lg border bg-card p-1">{periods.map((item) => <Link key={item.value} href={`${path}?period=${item.value}`} aria-current={period === item.value ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground", period === item.value && "bg-secondary text-foreground shadow-sm")}>{item.label}</Link>)}</nav>;
}
