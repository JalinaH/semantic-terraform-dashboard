export function UsageCompletenessWarning({ children }: { children: React.ReactNode }) {
  return <div role="note" className="rounded-lg border border-warning/25 bg-warning-muted px-4 py-3 text-xs leading-5 text-warning-foreground">{children}</div>;
}
