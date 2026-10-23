// Close reasons, a code-less close frame, a send after close, and the control-frame
// cap. Each case runs against the pinned `ws`, which is the contract.

import { WebSocket as WsClient, WebSocketServer as WsServer } from "ws";
import { expect, test } from "vitest";
import { CLOSING, OPEN } from "../../src/compat/ready-state";
import { WebSocketServer, type WebSocket } from "../../src/index";
import { TEST_TIMEOUT_MS } from "../binding/support";
import { terminateClient } from "../compat/socket/socket-support";
import { boundPort } from "./bound-port";
import { compare, parity } from "./parity-support";
import type { CloseReason } from "./parity-support";

const REASONS: ReadonlyArray<readonly [string, CloseReason]> = [
  ["undefined", undefined],
  ["an empty string", ""],
  ["a plain string", "done"],
  ["a Uint8Array", new Uint8Array([0x61, 0x62])],
  ["an empty Uint8Array", new Uint8Array(0)],
  ["an empty array", []],
  ["a number", 42],
  ["an object with no length", {}],
  ["a Float32Array", new Float32Array(20)],
  ["a 124-byte string", "a".repeat(124)],
  // These three measure over the 123-byte cap before `ws` reaches its type dispatch.
  ["a 200-byte Float32Array", new Float32Array(50)],
  ["a 140-byte Uint16Array", new Uint16Array(70)],
  ["a 100 MiB Uint8Array", new Uint8Array(100 * 1024 * 1024)],
  ["a 400-byte Uint8Array", new Uint8Array(400)],
];

/// `ws` maps every close reason to the same frame or throws the same error and leaves
/// the same state. The typed-array row pins GHSA-58qx-3vcg-4xpx.
test.each(REASONS)(
  "close reason parity for %s",
  { timeout: TEST_TIMEOUT_MS },
  async (_name, reason) => {
    const { expected, actual } = await compare(
      (socket) => socket.close(1000, reason),
      (socket) => socket.close(1000, reason),
    );

    if (!expected.threw) {
      // A valid reason reaches the engine, which cannot frame an app-initiated close
      // yet: ventiws reports the gap and stays OPEN where `ws` latches CLOSING.
      expect(expected.readyState).toBe(CLOSING);
      expect(actual.threw).toBe(true);
      expect(actual.message).toMatch(/app-initiated close is not implemented/);
      expect(actual.readyState).toBe(OPEN);

      return;
    }

    expect(actual.threw).toBe(true);
    expect(actual.name).toBe(expected.name);

    if (expected.name !== "TypeError" || expected.message.startsWith("Second argument")) {
      expect(actual.message).toBe(expected.message);
    }

    expect(actual.readyState).toBe(expected.readyState);
  },
);

/// `ws` writes an empty close payload for a code-less `close()`; its peer reports 1005.
test("close() with no code writes an empty close frame", { timeout: TEST_TIMEOUT_MS }, async () => {
  const server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const accepted = new Promise<WebSocket>((resolve) => server.once("connection", resolve));
  const client = new WsClient(`ws://127.0.0.1:${boundPort(server)}/`);
  client.on("error", () => undefined);

  const closed = new Promise<{ code: number; reason: Buffer }>((resolve) => {
    client.once("close", (code: number, reason: Buffer) => resolve({ code, reason }));
  });

  try {
    (await accepted).close();
    expect(await closed).toEqual({ code: 1005, reason: Buffer.alloc(0) });
  } finally {
    client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

type Closable = {
  on(event: "error", handler: (error: Error) => void): void;
  close(code?: number): void;
  send(data: string): void;
  readonly readyState: number;
  readonly CLOSING: number;
};

/// A send on a socket that is not open is `sendAfterClose`: no error, and the close
/// already in progress continues.
async function sendAfterClose(socket: Closable): Promise<{ errors: number; closing: boolean }> {
  const errors: Error[] = [];
  socket.on("error", (error) => errors.push(error));
  socket.close(1000);
  socket.send("hello");
  await new Promise((resolve) => setImmediate(resolve));

  return { errors: errors.length, closing: socket.readyState === socket.CLOSING };
}

test("a send after close matches ws", { timeout: TEST_TIMEOUT_MS }, async () => {
  const reference = new WsServer({ port: 0 });
  const taken = new Promise<WsClient>((resolve) => reference.once("connection", resolve));
  const referenceClient = new WsClient(`ws://127.0.0.1:${boundPort(reference)}/`);
  referenceClient.on("error", () => undefined);
  await new Promise<void>((resolve) => reference.once("listening", () => resolve()));
  const expected = await sendAfterClose(await taken);
  referenceClient.terminate();
  await new Promise<void>((resolve) => reference.close(() => resolve()));
  expect(expected).toEqual({ errors: 0, closing: true });

  const ours = new WebSocketServer({ port: 0 });
  const accepted = new Promise<WebSocket>((resolve) => ours.once("connection", resolve));
  const ourClient = new WsClient(`ws://127.0.0.1:${boundPort(ours)}/`);
  ourClient.on("error", () => undefined);
  await new Promise<void>((resolve) => ours.once("listening", () => resolve()));

  try {
    expect(await sendAfterClose(await accepted)).toEqual(expected);
  } finally {
    terminateClient(ourClient);
    await new Promise<void>((resolve) => ours.close(() => resolve()));
  }
});

/// RFC 6455 section 5.5 caps a control frame at 125 bytes.
test.each([
  ["ping refuses a 126-byte payload", "ping" as const, 126, true],
  ["ping refuses a 200-byte payload", "ping" as const, 200, true],
  ["pong refuses an oversize payload", "pong" as const, 126, true],
  ["ping accepts exactly 125 bytes", "ping" as const, 125, false],
])("%s", { timeout: TEST_TIMEOUT_MS }, async (_name, method, length, threw) => {
  const result = await parity((socket) => {
    socket[method](new Uint8Array(length));
  });

  expect(result.threw).toBe(threw);
});
