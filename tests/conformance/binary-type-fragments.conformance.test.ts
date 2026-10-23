// `binaryType: "fragments"` on a message that arrived as one, two, or three frames.
// Both implementations read the same bytes, so `ws`'s answer is the expectation.

import { expect, test } from "vitest";
import { WebSocketServer as WsServer, type WebSocket as WsSocket } from "ws";
import { TEST_TIMEOUT_MS } from "../binding/support";
import { clientFrames, type ClientFrame } from "../compat/socket/client-frames";
import { openRawClient } from "../compat/handshake";
import { nextSocket, upgradeHarness, waitFor } from "../compat/socket/codec-upgrade-support";
import { boundPort } from "./bound-port";

/// One binary message in `count` frames; the interior ends are the boundaries.
function piecesOf(count: number): ClientFrame[] {
  return Array.from({ length: count }, (_, index) => ({
    opcode: index === 0 ? 0x2 : 0x0,
    payload: Buffer.from(index === 0 ? "aa" : "b"),
    fin: index === count - 1,
  }));
}

/// The same frames read by a `ws` server, which is the reference.
async function wsPieces(frames: readonly ClientFrame[]): Promise<string[]> {
  const server = new WsServer({ port: 0 });
  const accepted = new Promise<WsSocket>((resolve) => server.once("connection", resolve));
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const raw = await openRawClient(boundPort(server));
  const socket = await accepted;

  try {
    const seen: string[][] = [];
    socket.on("message", (data) => {
      if (Array.isArray(data)) seen.push(data.map((piece) => piece.toString()));
    });
    socket.binaryType = "fragments";
    raw.write(clientFrames(frames));
    await waitFor(() => seen.length === 1);

    return seen[0] ?? [];
  } finally {
    raw.destroy();
    socket.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/// The same frames read by a ventiws server through the facade's own socket.
async function ventiwsPieces(frames: readonly ClientFrame[]): Promise<string[]> {
  const harness = await upgradeHarness();
  const accepted = nextSocket(harness.server);
  const raw = await openRawClient(harness.port);

  try {
    const socket = await accepted;
    const seen: string[][] = [];
    socket.on("message", (data) => {
      if (Array.isArray(data)) seen.push(data.map((piece) => piece.toString()));
    });
    socket.binaryType = "fragments";
    raw.write(clientFrames(frames));
    await waitFor(() => seen.length === 1);

    return seen[0] ?? [];
  } finally {
    raw.destroy();
    await harness.close();
  }
}

test.each([
  ["one", 1, ["aa"]],
  ["two", 2, ["aa", "b"]],
  ["three", 3, ["aa", "b", "b"]],
] as const)(
  "a %s-frame message yields the same pieces as ws",
  { timeout: TEST_TIMEOUT_MS },
  async (_name, count, expected) => {
    const frames = piecesOf(count);
    const [reference, actual] = await Promise.all([wsPieces(frames), ventiwsPieces(frames)]);
    expect(actual).toEqual(expected);
    expect(actual).toEqual(reference);
  },
);
