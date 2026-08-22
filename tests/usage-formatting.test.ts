import { describe, expect, it } from "vitest";
import { formatCompactTokens, formatExactTokens, formatPercent, formatUsd } from "@/lib/analytics/format";

describe("usage formatting", () => {
  it("preserves free, tiny, paid, and unknown cost semantics", () => {
    expect(formatUsd(0)).toBe("$0.000000");
    expect(formatUsd(0, { freeLabel: true })).toBe("Free ($0.000000)");
    expect(formatUsd(0.00042)).toBe("$0.000420");
    expect(formatUsd(0.0142)).toBe("$0.0142");
    expect(formatUsd(1.23)).toBe("$1.23");
    expect(formatUsd(null)).toBe("Not reported");
  });

  it("formats detailed and aggregate tokens and percentages", () => {
    expect(formatExactTokens(1842)).toBe("1,842");
    expect(formatExactTokens(null)).toBe("Not reported");
    expect(formatCompactTokens(18_400)).toBe("18.4K");
    expect(formatCompactTokens(1_200_000)).toBe("1.2M");
    expect(formatPercent(0.83)).toBe("83.0%");
    expect(formatPercent(null)).toBe("Not available");
  });
});
