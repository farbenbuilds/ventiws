// Public surface that is not a live connection: error codes, constructor statics,
// address validation, and the one `url` divergence a server-side socket has.

import { WebSocket as WsClient, WebSocketServer as WsServer } from "ws";
import { expect, test } from "vitest";
import { STATUS_ERROR_CODES, createError, createStatusError } from "../../src/compat/errors";
import { createWebSocketStream } from "../../src/compat/stream";
import { WebSocket, WebSocketServer } from "../../src/index";
import { boundPort } from "./address-support";
import { TEST_TIMEOUT_MS } from "../binding/support";

test("maps every engine status to a stable code", () => {
  expect(STATUS_ERROR_CODES).toEqual({
    closed: "ERR_SOCKET_CLOSED",
    "invalid-handle": "ERR_INVALID_HANDLE",
    "payload-too-large": "ERR_MAX_PAYLOAD",
    "invalid-close-code": "ERR_INVALID_CLOSE_CODE",
    "invalid-close-reason": "ERR_INVALID_CLOSE_REASON",
    "protocol-error": "ERR_PROTOCOL",
    "policy-violation": "ERR_POLICY_VIOLATION",
  });
  expect(createStatusError("protocol-error", "bad frame").code).toBe("ERR_PROTOCOL");
});

test("creates coded errors with the requested constructor", () => {
  const error = createError("ERR_INVALID_OPTION", "bad option");
  expect(error).toBeInstanceOf(Error);
  expect(error.code).toBe("ERR_INVALID_OPTION");
  expect(error.message).toBe("bad option");
  const range = createError("ERR_INVALID_OPTION", "bad range", RangeError);
  expect(range).toBeInstanceOf(RangeError);
  expect(range.code).toBe("ERR_INVALID_OPTION");
});

test("the constructor passes instanceof and carries the ready-state statics", () => {
  const socket = new WebSocket(null);
  expect(socket).toBeInstanceOf(WebSocket);
  expect(socket.CONNECTING).toBe(0);
  expect(socket.OPEN).toBe(1);
  expect(socket.CLOSING).toBe(2);
  expect(socket.CLOSED).toBe(3);
  expect(WebSocket.CONNECTING).toBe(0);
  expect(WebSocket.CLOSED).toBe(3);
  expect(WebSocket.WebSocket).toBe(WebSocket);
  expect(WebSocket.WebSocketServer).toBe(WebSocketServer);
  expect(WebSocket.Server).toBe(WebSocketServer);
  expect(WebSocket.createWebSocketStream).toBe(createWebSocketStream);
});

test("ready-state statics are non-writable like ws", () => {
  // `Reflect.set` reports the refusal as false without a strict-mode throw.
  expect(Reflect.set(WebSocket, "CONNECTING", 5)).toBe(false);
  expect(WebSocket.CONNECTING).toBe(0);
});

test("an invalid client address throws from the constructor", () => {
  expect(() => new WebSocket("not a url")).toThrow(SyntaxError);
  expect(() => new WebSocket("ftp://127.0.0.1/")).toThrow(/protocol must be one of/);
  expect(() => new WebSocket("ws://127.0.0.1/#fragment")).toThrow(/fragment identifier/);
  expect(() => new WebSocket("ws://127.0.0.1/", ["bad protocol"])).toThrow(
    /invalid or duplicated subprotocol/,
  );
});

test("binaryType accepts blob at runtime like ws", () => {
  const socket = new WebSocket(null);
  // SAFETY: `blob` is the runtime-only value `ws` accepts and `@types/ws` omits.
  socket.binaryType = "blob" as never;
  expect(socket.binaryType).toBe("blob");
});

/// `ws` only assigns `_url` on the client, so an accepted socket reports undefined
/// while ventiws starts the field at an empty string.
test(
  "a server socket reports undefined in ws and empty in ventiws",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const observed = async (
      make: () => [WsServer, (port: number) => WsClient | WebSocket],
    ): Promise<string | undefined> => {
      const [server, clientFor] = make();

      const connected = new Promise<{ url?: string; terminate(): void }>((resolve) =>
        server.once("connection", (socket) => resolve(socket)),
      );

      await new Promise<void>((resolve) => server.once("listening", () => resolve()));
      const client = clientFor(boundPort(server.address()));
      const peer = await connected;
      await new Promise<void>((resolve) => client.once("open", () => resolve()));
      const url = peer.url;
      client.terminate();
      peer.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));

      return url;
    };

    expect(
      await observed(() => [
        new WsServer({ port: 0 }),
        (port) => new WsClient(`ws://127.0.0.1:${port}/`),
      ]),
    ).toBeUndefined();
    expect(
      await observed(() => [
        new WebSocketServer({ port: 0 }),
        (port) => new WebSocket(`ws://127.0.0.1:${port}/`),
      ]),
    ).toBe("");
  },
);

test("DOM listeners deliver message events and deduplicate", () => {
  const socket = new WebSocket(null);
  const seen: Array<{ type: string; data: unknown; target: unknown }> = [];
  const payload = Buffer.from([1, 2, 3]);

  const handler = (event: WebSocket.MessageEvent): void => {
    seen.push({ type: event.type, data: event.data, target: event.target });
  };

  socket.addEventListener("message", handler);
  socket.addEventListener("message", handler);
  socket.emit("message", Buffer.from("hello"), false);
  socket.emit("message", payload, true);
  socket.removeEventListener("message", handler);
  socket.emit("message", Buffer.from("ignored"), false);
  let opened = 0;
  socket.onopen = () => {
    opened += 1;
  };

  socket.emit("open");
  expect(seen).toEqual([
    { type: "message", data: "hello", target: socket },
    { type: "message", data: payload, target: socket },
  ]);
  expect(opened).toBe(1);
});
