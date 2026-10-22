import type { EngineEvent, EngineEventKind, NativeServerConfig } from "../../src/binding/native";
import { closeServer, createServer, finalizeServer, listenServer } from "../../src/binding/server";
import { countOf, delay, settleEvents, waitUntil } from "./event-support";

export { EVENT_TIMEOUT_MS } from "./event-support";

export const TEST_TIMEOUT_MS = 20_000;

const FINALIZE_ATTEMPTS = 200;
const POLL_INTERVAL_MS = 5;

export type ServerFixture = {
  readonly handle: number;
  readonly events: EngineEvent[];
  waitFor(kind: EngineEventKind): Promise<EngineEvent>;
  waitForCount(kind: EngineEventKind, count: number): Promise<void>;
  settle(): Promise<void>;
  dispose(): Promise<void>;
};

export function fixture(config: NativeServerConfig): ServerFixture {
  const events: EngineEvent[] = [];

  const handle = createServer(config, (event) => {
    events.push(event);
  });

  return {
    handle,
    events,
    waitFor: (kind) =>
      waitUntil(events, (seen) => countOf(seen, kind) > 0, kind).then(() => {
        const found = events.find((event) => event.kind === kind);

        if (found === undefined) throw new Error(`missing ${kind} after wait`);

        return found;
      }),
    waitForCount: (kind, count) =>
      waitUntil(events, (seen) => countOf(seen, kind) >= count, `${count} x ${kind}`),
    settle: () => settleEvents(events),
    async dispose() {
      try {
        closeServer(handle);
      } catch {
        // Already closing, closed, or finalized; the loop below settles it.
      }

      for (let attempt = 0; attempt < FINALIZE_ATTEMPTS; attempt += 1) {
        try {
          finalizeServer(handle);

          return;
        } catch (error) {
          if (!(error instanceof Error)) throw error;

          if (error.message === "UnknownServer") return;

          if (error.message === "EventsPending" || error.message === "ServerNotClosed") {
            await delay(POLL_INTERVAL_MS);
            continue;
          }

          throw error;
        }
      }

      // Raised, not returned: returning here leaves the slot owned, the next
      // `fixture()` takes it, and a test holding the old handle resolves a live
      // server instead of the `UnknownServer` it asserts.
      throw new Error(`server ${handle} did not drain; its slot is still owned`);
    },
  };
}

export function start(config: NativeServerConfig): ServerFixture {
  const server = fixture(config);
  listenServer(server.handle);

  return server;
}

/// Starts a server and resolves its bound port from the `listening` event, so
/// `port: 0` tests never race another process for a probed port.
export async function startAndWait(
  config: NativeServerConfig,
): Promise<{ readonly server: ServerFixture; readonly port: number }> {
  const server = start(config);
  const listening = await server.waitFor("listening");

  return { server, port: listening.code };
}
