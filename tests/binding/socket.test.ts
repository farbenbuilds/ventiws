import { afterEach, expect, test } from "vitest";
import { engineLimits, serverDroppedMessages } from "../../src/binding/server";
import {
  closeSocket,
  pauseSocket,
  pumpSocket,
  resumeSocket,
  sendSocket,
  socketBufferedAmount,
} from "../../src/binding/socket";
import { connectedSocket, type ConnectedSocket, TEST_TIMEOUT_MS } from "./support";

/// Read from the addon: a TypeScript copy of a Zig comptime constant is a second
/// source of truth, and this cap has drifted from the engine's before.
const MESSAGE_BYTES = engineLimits().messageBytes;
const cleanups: Array<() => Promise<void>> = [];

function nextMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true });
    socket.addEventListener("error", () => reject(new Error("client socket error")), {
      once: true,
    });
  });
}

async function connected(): Promise<ConnectedSocket> {
  const open = await connectedSocket();
  cleanups.push(async () => {
    open.socket.close();
    await open.server.dispose();
  });

  return open;
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

test(
  "send stages outbound payloads and reports the buffered amount",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { server, connection } = await connected();
    expect(sendSocket(server.handle, connection, new Uint8Array([1, 2, 3]), true)).toBe("ok");
    expect(socketBufferedAmount(server.handle, connection)).toBe(3);
    expect(sendSocket(server.handle, connection, new TextEncoder().encode("hi"))).toBe("ok");
    expect(socketBufferedAmount(server.handle, connection)).toBe(5);
  },
);

test("send copies the payload before returning", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { server, connection, socket } = await connected();
  const payload = new TextEncoder().encode("original");
  const received = nextMessage(socket);

  expect(sendSocket(server.handle, connection, payload, false)).toBe("ok");
  // The engine retained a copy, so mutating the caller's buffer cannot change the frame.
  payload.fill(0x78);
  expect(pumpSocket(server.handle, connection)).toBe("ok");
  await expect(received).resolves.toBe("original");
  expect(socketBufferedAmount(server.handle, connection)).toBe(0);
});

test(
  "send is bounded by the payload cap and the staging ring",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { server, connection } = await connected();
    expect(sendSocket(server.handle, connection, new Uint8Array(MESSAGE_BYTES), true)).toBe("ok");
    expect(sendSocket(server.handle, connection, new Uint8Array(MESSAGE_BYTES + 1))).toBe(
      "payload-too-large",
    );

    for (let staged = 0; staged < 7; staged += 1) {
      expect(sendSocket(server.handle, connection, new Uint8Array([staged]))).toBe("ok");
    }

    expect(sendSocket(server.handle, connection, new Uint8Array([0xff]))).toBe("backpressure");
    expect(socketBufferedAmount(server.handle, connection)).toBe(MESSAGE_BYTES + 7);
  },
);

test("pause and resume are idempotent", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { server, connection } = await connected();
  expect(pauseSocket(server.handle, connection)).toBe("ok");
  expect(pauseSocket(server.handle, connection)).toBe("ok");
  expect(resumeSocket(server.handle, connection)).toBe("ok");
  expect(resumeSocket(server.handle, connection)).toBe("ok");
});

type CloseCase = readonly [string, number, Uint8Array, string];

const CLOSE_CASES: readonly CloseCase[] = [
  ["the reserved code 1005", 1005, new Uint8Array(), "invalid-close-code"],
  ["a 124-byte reason", 3000, new Uint8Array(124), "invalid-close-reason"],
  ["an invalid UTF-8 reason", 3000, new Uint8Array([0xff]), "invalid-close-reason"],
];

test.each(CLOSE_CASES)(
  "close refuses %s",
  { timeout: TEST_TIMEOUT_MS },
  async (_name, code, reason, status) => {
    const { server, connection } = await connected();
    expect(closeSocket(server.handle, connection, code, reason)).toBe(status);
  },
);

test(
  "a stale connection handle is a typed status, not a crash",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { server, connection, socket } = await connected();
    socket.close();
    await server.waitFor("connectionClose");
    expect(sendSocket(server.handle, connection, new Uint8Array([1]))).toBe("invalid-handle");
    expect(closeSocket(server.handle, connection, 1000, new Uint8Array())).toBe("invalid-handle");
    expect(pauseSocket(server.handle, connection)).toBe("invalid-handle");
    expect(resumeSocket(server.handle, connection)).toBe("invalid-handle");
    expect(socketBufferedAmount(server.handle, connection)).toBe(0);
  },
);

test("rejects malformed arguments and unknown servers", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { server, connection } = await connected();
  expect(() => closeSocket(server.handle, connection, 70_000, new Uint8Array())).toThrow(/uint16/);
  expect(() => sendSocket(server.handle + 1, connection, new Uint8Array())).toThrow(
    /UnknownServer/,
  );
});

test(
  "counts inbound messages dropped when the consumer stops draining",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { server, socket } = await connected();
    const count = 256;

    // The dispatch never takes from the ring, so this burst outruns its 64 slots.
    for (let index = 0; index < count; index += 1) socket.send(`message-${index}`);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const dropped = serverDroppedMessages(server.handle);

    expect(dropped).toBeGreaterThan(0n);
    expect(dropped).toBeLessThanOrEqual(BigInt(count));
  },
);
