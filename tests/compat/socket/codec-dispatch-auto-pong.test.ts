// Auto-pong is a protocol obligation only while the socket is OPEN.
//
// `ws` routes a ping through its sender while open and through `sendAfterClose` once the
// socket is CLOSING or CLOSED, which writes nothing; a pong after the close frame is a
// frame a peer is free to refuse.

import { expect, test } from "vitest";
import { PassThrough } from "node:stream";
import { dispatch } from "../../../src/compat/socket/codec-dispatch";
import { createSocketState } from "../../../src/compat/socket/state";
import { CLOSED, CLOSING, OPEN } from "../../../src/compat/ready-state";
import type { ReadyState } from "../../../src/types/close";

const PING = Buffer.from([1, 2, 3]);

/// Dispatches one ping and returns the bytes the fake transport received. The default
/// server role takes the unmasked small-frame path, so the write is the pong itself and
/// the placeholder codec handle is never read.
function pongFor(readyState: ReadyState): Buffer {
  const state = createSocketState();
  state.readyState = readyState;
  state.codec = 1n;
  const transport = new PassThrough();
  const written: Buffer[] = [];
  transport.on("data", (chunk: Buffer) => written.push(chunk));
  state.transport = transport;
  dispatch(state, 1n, "ping", 0, PING, null);
  return Buffer.concat(written);
}

test("a ping while OPEN is answered", () => {
  expect(pongFor(OPEN).length).toBeGreaterThan(0);
});

test.each([
  ["CLOSING", CLOSING],
  ["CLOSED", CLOSED],
] as const)("a ping while %s is not answered", (_name, readyState) => {
  expect(pongFor(readyState)).toHaveLength(0);
});
