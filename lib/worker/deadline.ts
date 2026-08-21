import { WorkerExecutionError } from "@/lib/worker/errors";

const DEFAULT_PERSISTENCE_TIMEOUT_MS = 15_000;

export interface WorkerDeadline {
  readonly signal: AbortSignal;
  run<T>(operation: () => Promise<T>): Promise<T>;
  dispose(): void;
}

export function createWorkerDeadline(timeoutMs: number, now = () => Date.now()): WorkerDeadline {
  const controller = new AbortController();
  const expiresAt = now() + timeoutMs;

  return {
    signal: controller.signal,
    async run<T>(operation: () => Promise<T>) {
      const remaining = expiresAt - now();
      if (remaining <= 0) {
        controller.abort();
        throw new WorkerExecutionError("execution_timeout");
      }
      return withTimeout(operation(), remaining, () => controller.abort());
    },
    dispose() {
      controller.abort();
    },
  };
}

export function withPersistenceTimeout<T>(operation: Promise<T>, timeoutMs = DEFAULT_PERSISTENCE_TIMEOUT_MS) {
  return withTimeout(operation, timeoutMs);
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => finish(() => {
      onTimeout?.();
      reject(new WorkerExecutionError("execution_timeout"));
    }), timeoutMs);

    operation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}
