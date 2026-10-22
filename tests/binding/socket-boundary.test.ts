import { expect, test } from "vitest";
import {
  closeSocket,
  pauseSocket,
  resumeSocket,
  sendSocket,
  socketBufferedAmount,
} from "../../src/binding/socket";
import { connectedSocket } from "./socket-support";
import { TEST_TIMEOUT_MS } from "./support";

test(
  "close validation mirrors the compatibility contract",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { server, connection, socket } = await connectedSocket();

    try {
      expect(closeSocket(server.handle, connection, 1005, new Uint8Array())).toBe(
        "invalid-close-code",
      );
      expect(closeSocket(server.handle, connection, 3000, new Uint8Array(124))).toBe(
        "invalid-close-reason",
      );
      expect(closeSocket(server.handle, connection, 3000, new Uint8Array([0xff]))).toBe(
        "invalid-close-reason",
      );
    } finally {
      socket.close();
      await server.dispose();
    }
  },
);

test(
  "a stale connection handle is a typed status, not a crash",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { server, connection, socket } = await connectedSocket();

    try {
      socket.close();
      await server.waitFor("connectionClose");
      expect(sendSocket(server.handle, connection, new Uint8Array([1]))).toBe("invalid-handle");
      expect(closeSocket(server.handle, connection, 1000, new Uint8Array())).toBe("invalid-handle");
      expect(pauseSocket(server.handle, connection)).toBe("invalid-handle");
      expect(resumeSocket(server.handle, connection)).toBe("invalid-handle");
      expect(socketBufferedAmount(server.handle, connection)).toBe(0);
    } finally {
      await server.dispose();
    }
  },
);

test("rejects malformed arguments and unknown servers", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { server, connection, socket } = await connectedSocket();

  try {
    // A JavaScript caller can pass a string where the binding expects bytes.
    // @ts-expect-error a string is not a Uint8Array
    expect(() => sendSocket(server.handle, connection, "text")).toThrow(/Uint8Array/);
    expect(() => closeSocket(server.handle, connection, 70_000, new Uint8Array())).toThrow(
      /uint16/,
    );
    expect(() => sendSocket(server.handle + 1, connection, new Uint8Array())).toThrow(
      /UnknownServer/,
    );
  } finally {
    socket.close();
    await server.dispose();
  }
});
