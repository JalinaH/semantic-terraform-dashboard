import { spawn } from "node:child_process";

const MAX_CAPTURED_OUTPUT_BYTES = 64 * 1024;

export interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let timedOut = false;
    const append = (current: Buffer, chunk: Buffer) => Buffer.concat([current, chunk]).subarray(0, MAX_CAPTURED_OUTPUT_BYTES);
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    const timeout = options.timeoutMs ? setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, options.timeoutMs) : null;
    timeout?.unref();
    child.once("error", reject);
    child.once("close", (exitCode) => {
      if (timeout) clearTimeout(timeout);
      resolve({ exitCode, stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"), timedOut });
    });
  });
}
