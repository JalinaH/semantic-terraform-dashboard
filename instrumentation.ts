export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertDashboardRuntimeConfiguration } = await import("@/lib/config");
  assertDashboardRuntimeConfiguration();
}
