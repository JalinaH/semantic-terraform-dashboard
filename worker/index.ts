import { runWorker, workerHealthcheck } from "@/worker/runtime";
import { safeStartupDiagnostic } from "@/worker/diagnostics";

async function main() {
  if (process.argv.includes("--healthcheck")) {
    process.stdout.write(`${JSON.stringify(workerHealthcheck())}\n`);
    return;
  }
  await runWorker({ once: process.argv.includes("--once") });
}

void main().catch((error: unknown) => {
  const diagnostic = safeStartupDiagnostic(error);
  process.stderr.write(`${JSON.stringify({ event: "worker_startup_failed", ...diagnostic })}\n`);
  process.exitCode = 1;
});
