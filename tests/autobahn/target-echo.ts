import { pack } from "./target-runtime.ts";
import type { VentiAddon } from "./target-runtime.ts";

/// The three socket calls the echo target needs, kept narrow so the regression
/// test can drive them without a native addon.
export type EchoAddon = Pick<VentiAddon, "pumpSocket" | "sendSocket" | "takeSocketMessage">;

export type PurgeAddon = Pick<VentiAddon, "purgeSocketMessage">;

type PendingEcho = {
  readonly connection: bigint;
  readonly bytes: Buffer;
  readonly isBinary: boolean;
};

export type EchoState = {
  handle: number;
  connection: bigint | null;
  /// A message taken from the inbound ring that the outbound ring refused.
  pending: PendingEcho | null;
  retryScheduled: boolean;
};

/// A connection handle is `generation << 32 | index`, the packing `src/binding/handle.ts` does.
export function echoState(): EchoState {
  return { handle: 0, connection: null, pending: null, retryScheduled: false };
}

/// `NATIVE_SOCKET_STATUSES` order; a full outbound ring is temporary, unlike the
/// other non-ok statuses.
const BACKPRESSURE = 3;

/// Reply to every message with the same opcode and change nothing else: anything smarter makes a
/// case pass or fail for a reason the report cannot name.
///
/// The inbound ring is FIFO across the whole server, so this drains until empty. `pumpSocket`
/// can report backpressure after the engine accepts a payload; returning there would leave the
/// payload at the head and stop taking inbound messages, which is the 12.5.2 timeout. Retry on a
/// later tick instead, keeping a refused outbound message until it can be staged.
export function reply(a: EchoAddon, state: EchoState): void {
  const connection = state.connection;

  if (connection === null) return;

  for (;;) {
    if (state.pending !== null && state.pending.connection !== connection) state.pending = null;

    const pumped = a.pumpSocket(state.handle, connection);

    if (pumped === BACKPRESSURE) {
      retry(a, state);

      return;
    }

    if (pumped !== 0) return;

    if (state.pending !== null) {
      const { bytes, isBinary } = state.pending;
      const sent = a.sendSocket(state.handle, connection, bytes, isBinary);

      if (sent === BACKPRESSURE) {
        retry(a, state);

        return;
      }

      state.pending = null;

      if (sent !== 0) return;

      continue;
    }

    const taken = a.takeSocketMessage(state.handle, connection);

    if (taken === null) return;
    const [bytes, isBinary] = taken;
    const sent = a.sendSocket(state.handle, connection, bytes, isBinary);

    if (sent === BACKPRESSURE) {
      state.pending = { connection, bytes, isBinary };
      retry(a, state);

      return;
    }

    if (sent !== 0) return;
  }
}

function retry(a: EchoAddon, state: EchoState): void {
  if (state.retryScheduled) return;
  state.retryScheduled = true;
  setImmediate(() => {
    state.retryScheduled = false;
    reply(a, state);
  });
}

/// A case that lost the race leaves records at the head of a strictly ordered FIFO, and nothing
/// could match them.
export function purge(a: PurgeAddon, state: EchoState, index: number, generation: number): void {
  a.purgeSocketMessage(state.handle, index, generation);

  if (state.connection === pack(index, generation)) state.pending = null;
}
