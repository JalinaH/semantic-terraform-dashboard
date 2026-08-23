export function safeStartupDiagnostic(error: unknown) {
  const name = error instanceof Error ? error.name.slice(0, 100) : "UnknownError";
  const candidate = error && typeof error === "object" && "code" in error
    ? Reflect.get(error, "code")
    : undefined;
  const code = typeof candidate === "string" && (/^P\d{4}$/.test(candidate) || SAFE_STARTUP_CODES.has(candidate))
    ? candidate
    : "worker_startup_failed";
  return { errorName: name, errorCode: code };
}

const SAFE_STARTUP_CODES = new Set([
  "agent_version_mismatch",
  "agent_version_unavailable",
  "worker_configuration_invalid",
]);
