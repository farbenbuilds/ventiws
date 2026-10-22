import type { EngineEvent, EngineEventKind } from "../../src/binding/native";

export const EVENT_TIMEOUT_MS = 8_000;

const POLL_INTERVAL_MS = 5;

export function engineFailure(events: EngineEvent[]): Error | undefined {
  const event = events.find((candidate) => candidate.kind === "engineError");

  if (event === undefined) return undefined;

  return new Error(`engineError received (code ${event.code})`);
}

export const countOf = (events: EngineEvent[], kind: EngineEventKind): number =>
  events.filter((event) => event.kind === kind).length;

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function waitUntil(
  events: EngineEvent[],
  ready: (events: EngineEvent[]) => boolean,
  describe: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + EVENT_TIMEOUT_MS;

    function poll(): void {
      const failure = engineFailure(events);

      if (failure !== undefined) {
        reject(failure);

        return;
      }

      if (ready(events)) {
        resolve();

        return;
      }

      if (Date.now() >= deadline) {
        reject(new Error(`timed out waiting for ${describe}`));

        return;
      }

      setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
  });
}

/// Resolves once the event list has not grown for three consecutive polls, so
/// a late duplicate terminal event cannot pass an exactly-once assertion.
export function settleEvents(events: EngineEvent[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let lastLength = events.length;
    let stable = 0;
    const deadline = Date.now() + EVENT_TIMEOUT_MS;

    function poll(): void {
      const failure = engineFailure(events);

      if (failure !== undefined) {
        reject(failure);

        return;
      }

      if (events.length === lastLength) {
        stable += 1;
      } else {
        stable = 0;
        lastLength = events.length;
      }

      if (stable >= 3) {
        resolve();

        return;
      }

      if (Date.now() >= deadline) {
        reject(new Error("timed out waiting for the event stream to settle"));

        return;
      }

      setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
  });
}
