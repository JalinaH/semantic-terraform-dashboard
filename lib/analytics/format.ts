export function formatUsd(value: number | string | null, options: { freeLabel?: boolean } = {}) {
  if (value === null) return "Not reported";
  const amount = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(amount)) return "Not reported";
  if (amount === 0) return options.freeLabel ? "Free ($0.000000)" : "$0.000000";
  const digits = amount < 0.01 ? 6 : amount < 1 ? 4 : 2;
  return `$${amount.toFixed(digits)}`;
}

export function formatExactTokens(value: number | null) {
  return value === null ? "Not reported" : value.toLocaleString("en-US");
}

export function formatCompactTokens(value: number | null) {
  if (value === null) return "Not reported";
  if (Math.abs(value) < 10_000) return value.toLocaleString("en-US");
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number | null, digits = 1) {
  return value === null ? "Not available" : `${(value * 100).toFixed(digits)}%`;
}

export function formatLatency(value: number | null) {
  if (value === null) return "Not reported";
  return value < 1_000 ? `${value}ms` : `${(value / 1_000).toFixed(2)}s`;
}
