import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface MetricCardProps {
  title: string;
  value: string;
  description: string;
  trend?: string;
  icon: LucideIcon;
}

export function MetricCard({ title, value, description, trend, icon: Icon }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <span className="flex size-8 items-center justify-center rounded-md border bg-secondary/60 text-muted-foreground">
            <Icon aria-hidden="true" className="size-4" />
          </span>
        </div>
        <p className="mt-5 text-3xl font-semibold tracking-[-0.04em]">{value}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-muted-foreground">{description}</span>
          {trend ? (
            <span className="inline-flex items-center gap-0.5 font-medium text-success-foreground">
              <ArrowUpRight aria-hidden="true" className="size-3" />
              {trend}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
