// `binaryType: "fragments"` on a message that arrived as exactly two frames.
//
// The boundary list holds N-1 interior ends for N pieces, so a two-piece message has
// one end: a consumer that treats fewer than two ends as "arrived whole" hands back a
// single buffer where `ws` hands back two. The three-piece case cannot catch that, and
// the peer has to be a raw socket because `send` starts a new message per call.
//
// Both implementations read the same bytes, so the expectation is `ws`'s own answer.

import type { AddressInfo } from "node:net";
import { expect, test } from "vitest";
import { WebSocketServer as WsServer, type WebSocket as WsSocket } from "ws";
import { TEST_TIMEOUT_MS } from "../binding/support";
import { clientFrames, type ClientFrame } from "../binding/codec-frames";
import { openRawClient } from "../binding/codec-net";
import { nextSocket, upgradeHarness, waitFor } from "../compat/socket/codec-upgrade-support";

/// One binary message in `count` frames: the interior ends are the boundaries.
function piecesOf(count: number): ClientFrame[] {
  return Array.from({ length: count }, (_, index) => ({
    opcode: index === 0 ? 0x2 : 0x0,
    payload: Buffer.from(index === 0 ? "aa" : "b"),
    fin: index === count - 1,
  }));
}

/// Runs the frames into a `ws` server and returns its `fragments` answer.
async function wsPieces(frames: readonly ClientFrame[]): Promise<string[]> {
  const server = new WsServer({ port: 0 });
  const accepted = new Promise<WsSocket>((resolve) => server.once("connection", resolve));
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  // Dial before awaiting the connection: a promise nobody has connected to never settles.
  const raw = await openRawClient(port);
  const socket = await accepted;
  try {
    const seen: string[][] = [];
    socket.on("message", (data) => {
      if (Array.isArray(data)) seen.push(data.map((piece) => piece.toString()));
    });
    socket.binaryType = "fragments";
    try {
      raw.write(clientFrames(frames));
      await waitFor(() => seen.length === 1);
      return seen[0] ?? [];
    } finally {
      raw.destroy();
    }
  } finally {
    socket.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/// The same frames into a ventiws server, through the facade's own socket.
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

test(
  "a two-piece message yields two fragments in both implementations",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const frames = piecesOf(2);
    const [expected, actual] = await Promise.all([wsPieces(frames), ventiwsPieces(frames)]);
    expect(actual).toEqual(["aa", "b"]);
    expect(actual).toEqual(expected);
  },
);

test(
  "a three-piece message still yields three fragments",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const frames = piecesOf(3);
    const [expected, actual] = await Promise.all([wsPieces(frames), ventiwsPieces(frames)]);
    expect(actual).toEqual(["aa", "b", "b"]);
    expect(actual).toEqual(expected);
  },
);

test(
  "a whole message is still one fragment in both implementations",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const frames = piecesOf(1);
    const [expected, actual] = await Promise.all([wsPieces(frames), ventiwsPieces(frames)]);
    expect(actual).toEqual(["aa"]);
    expect(actual).toEqual(expected);
  },
);
