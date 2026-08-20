import { runWorker, workerHealthcheck } from "@/worker/runtime";

if (process.argv.includes("--healthcheck")) {
  process.stdout.write(`${JSON.stringify(workerHealthcheck())}\n`);
} else {
  await runWorker({ once: process.argv.includes("--once") });
}
