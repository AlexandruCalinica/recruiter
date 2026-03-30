import { telemetry, TelemetryEvents, createActor } from "libeam";

export interface WaitForCastOptions {
  actorName?: string;
  timeout?: number;
}

/**
 * Returns a promise that resolves when a `handleCast` completes.
 *
 * Usage:
 * ```ts
 * const done = waitForCast({ actorName: "ingestion" });
 * ingestion.cast("ingest", payload);
 * await done; // now assert DB state
 * ```
 */
export function waitForCast(opts?: WaitForCastOptions): Promise<void> {
  const timeout = opts?.timeout ?? 5000;
  const handlerId = `test-wait-cast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      telemetry.detach(handlerId);
      reject(new Error(`waitForCast timed out after ${timeout}ms`));
    }, timeout);

    telemetry.attach(
      handlerId,
      [[...TelemetryEvents.actor.handleCast, "stop"]],
      (_event, _measurements, metadata) => {
        const actorId = metadata.actor_id as string | undefined;
        if (!opts?.actorName || actorId?.includes(opts.actorName)) {
          clearTimeout(timer);
          telemetry.detach(handlerId);
          resolve();
        }
      }
    );
  });
}

export function waitForCastError(opts?: WaitForCastOptions): Promise<unknown> {
  const timeout = opts?.timeout ?? 5000;
  const handlerId = `test-wait-cast-err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      telemetry.detach(handlerId);
      reject(new Error(`waitForCastError timed out after ${timeout}ms`));
    }, timeout);

    telemetry.attach(
      handlerId,
      [[...TelemetryEvents.actor.handleCast, "exception"]],
      (_event, _measurements, metadata) => {
        const actorId = metadata.actor_id as string | undefined;
        if (!opts?.actorName || actorId?.includes(opts.actorName)) {
          clearTimeout(timer);
          telemetry.detach(handlerId);
          resolve(metadata.error);
        }
      }
    );
  });
}

interface RecordedMessage {
  method: string;
  args: unknown;
  timestamp: number;
}

export const TestProbe = createActor((ctx, self) => {
  const received: RecordedMessage[] = [];

  return self
    .onCast("record", (msg: { method: string; args: unknown }) => {
      received.push({ ...msg, timestamp: Date.now() });
    })
    .onCall("messages", () => [...received])
    .onCall("count", () => received.length)
    .onCall("clear", () => {
      received.length = 0;
      return true;
    });
});

export function cleanupTelemetry(): void {
  telemetry.reset();
}
