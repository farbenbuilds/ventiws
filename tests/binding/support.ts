import type { EngineEvent, EngineEventKind, NativeServerConfig } from "../../src/binding/native";
import { packConnectionHandle } from "../../src/binding/handle";
import { closeServer, createServer, finalizeServer, listenServer } from "../../src/binding/server";

export const TEST_TIMEOUT_MS = 20_000;

const EVENT_TIMEOUT_MS = 8_000;
const POLL_INTERVAL_MS = 5;
const FINALIZE_ATTEMPTS = 200;

export type ServerFixture = {
  readonly handle: number;
  readonly events: EngineEvent[];
  waitFor(kind: EngineEventKind): Promise<EngineEvent>;
  settle(): Promise<void>;
  dispose(): Promise<void>;
};

export type ConnectedSocket = {
  readonly server: ServerFixture;
  readonly connection: bigint;
  readonly socket: WebSocket;
};

function waitUntil(
  events: EngineEvent[],
  ready: (seen: EngineEvent[]) => boolean,
  label: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + EVENT_TIMEOUT_MS;

    function poll(): void {
      if (ready(events)) return resolve();

      if (Date.now() >= deadline) return reject(new Error(`timed out waiting for ${label}`));
      setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
  });
}

/// Resolves after the event list has not grown for three polls, so a late duplicate
/// terminal event cannot pass an exactly-once assertion.
function settleEvents(events: EngineEvent[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let lastLength = events.length;
    let stable = 0;
    const deadline = Date.now() + EVENT_TIMEOUT_MS;

    function poll(): void {
      stable = events.length === lastLength ? stable + 1 : 0;
      lastLength = events.length;

      if (stable >= 3) return resolve();

      if (Date.now() >= deadline) {
        return reject(new Error("timed out waiting for the event stream to settle"));
      }

      setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
  });
}

async function dispose(handle: number): Promise<void> {
  try {
    closeServer(handle);
  } catch {
    // Already closing, closed, or finalized; the retry loop settles it.
  }

  for (let attempt = 0; attempt < FINALIZE_ATTEMPTS; attempt += 1) {
    try {
      finalizeServer(handle);

      return;
    } catch (error) {
      if (!(error instanceof Error)) throw error;

      if (error.message === "UnknownServer") return;

      if (error.message === "EventsPending" || error.message === "ServerNotClosed") {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }

      throw error;
    }
  }

  throw new Error(`server ${handle} did not drain; its slot is still owned`);
}

export function fixture(config: NativeServerConfig): ServerFixture {
  const events: EngineEvent[] = [];
  const handle = createServer(config, (event) => events.push(event));

  return {
    handle,
    events,
    async waitFor(kind) {
      await waitUntil(events, (seen) => seen.some((event) => event.kind === kind), kind);
      const found = events.find((event) => event.kind === kind);

      if (found === undefined) throw new Error(`missing ${kind} after wait`);

      return found;
    },
    settle: () => settleEvents(events),
    dispose: () => dispose(handle),
  };
}

export function start(config: NativeServerConfig): ServerFixture {
  const server = fixture(config);
  listenServer(server.handle);

  return server;
}

/// Starts on `port: 0` and reads the bound port from the event, so tests never race
/// another process for a probed port.
export async function startAndWait(
  config: NativeServerConfig,
): Promise<{ readonly server: ServerFixture; readonly port: number }> {
  const server = start(config);
  const listening = await server.waitFor("listening");

  return { server, port: listening.code };
}

export async function connectedSocket(): Promise<ConnectedSocket> {
  const { server, port } = await startAndWait({ host: "127.0.0.1", port: 0 });
  const socket = new WebSocket(`ws://127.0.0.1:${port}/`);

  try {
    const open = await server.waitFor("connectionOpen");

    return { server, connection: packConnectionHandle(open.index, open.generation), socket };
  } catch (error) {
    socket.close();
    await server.dispose();
    throw error;
  }
}
