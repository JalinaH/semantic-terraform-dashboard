export function safeStartupDiagnostic(error: unknown) {
  const name = error instanceof Error ? error.name.slice(0, 100) : "UnknownError";
  const candidate = error && typeof error === "object" && "code" in error
    ? Reflect.get(error, "code")
    : undefined;
  const code = typeof candidate === "string" && /^P\d{4}$/.test(candidate)
    ? candidate
    : "worker_startup_failed";
  return { errorName: name, errorCode: code };
}
