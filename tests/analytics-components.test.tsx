import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrainCircuit } from "lucide-react";
import { AnalyticsKpiCard } from "@/components/analytics/analytics-kpi-card";
import { DataCompleteness } from "@/components/analytics/data-completeness";
import { SpendTrendChart, TokenTrendChart } from "@/components/analytics/usage-trend-charts";

describe("analytics components", () => {
  it("renders safe comparison and completeness labels", () => {
    const html = renderToStaticMarkup(<><AnalyticsKpiCard title="Tokens" value="184K" description="Reported totals" icon={BrainCircuit} comparison={{ kind: "percent", change: -0.184 }} /><DataCompleteness tokens={81} costs={72} total={84} /></>);
    expect(html).toContain("18.4% vs previous period");
    expect(html).toContain("Token telemetry");
    expect(html).toContain("81 / 84");
    expect(html).toContain("72 / 84");
  });

  it("renders chart empty states instead of zero-filled axes", () => {
    const html = renderToStaticMarkup(<><TokenTrendChart data={[]} /><SpendTrendChart data={[]} /></>);
    expect(html.match(/No reported telemetry in this period/g)).toHaveLength(2);
  });
});
