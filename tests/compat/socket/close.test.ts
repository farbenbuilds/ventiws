import { expect, test } from "vitest";
import { closeFrameWritten } from "../../../src/compat/socket/lifecycle";
import type { WebSocket } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { attached, terminateClient } from "./socket-support";

const MAX_MESSAGE_BYTES = 32 * 1024;

/// The reason shapes `ws` reads as "no reason data" or refuses, which is what the close
/// path has to handle.
type CloseReasonFixture =
  | undefined
  | null
  | string
  | Uint8Array
  | readonly number[]
  | number
  | Readonly<Record<string, never>>;

/// The engine route cannot frame an app-initiated close yet: a valid close reports the
/// missing implementation once, writes no frame, and leaves the socket OPEN.
function expectUnsupportedClose(
  socket: WebSocket,
  code: number,
  reason?: CloseReasonFixture,
): void {
  const errors: Error[] = [];
  socket.on("error", (error) => {
    errors.push(error);
  });
  // SAFETY: the fixture is a reason shape `ws` accepts or refuses at runtime; the declaration
  // narrows it to a string or a `Uint8Array`.
  socket.close(code, reason as never);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toMatchObject({ code: "ERR_POLICY_VIOLATION" });
  expect(errors[0]?.message).toMatch(/app-initiated close is not implemented/);
  expect(socket.readyState).toBe(socket.OPEN);
  expect(closeFrameWritten(socket)).toBe(false);
}

test(
  "a fractional close code is validated and then refused as unsupported",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { server, client, socket } = await attached();

    try {
      expectUnsupportedClose(socket, 1000.5);
    } finally {
      terminateClient(client);
      await server.dispose();
    }
  },
);

/// `ws` treats any argument without a truthy `length` as "no reason data", so the close is
/// attempted; the engine route then reports the unsupported close instead of sending a bare
/// frame. `null` is a deliberate divergence: `ws` surfaces a V8-internal `TypeError` there.
test.each([
  ["undefined", undefined],
  ["null", null],
  ["an empty string", ""],
  ["an empty Uint8Array", new Uint8Array(0)],
  ["an empty array", []],
  ["a number", 42],
  ["an object with no length", {}],
])(
  "an absent reason (%s) on the engine route reports the unsupported close",
  { timeout: TEST_TIMEOUT_MS },
  async (_name, reason) => {
    const { server, client, socket } = await attached();

    try {
      expectUnsupportedClose(socket, 1000, reason);
    } finally {
      terminateClient(client);
      await server.dispose();
    }
  },
);

/// The ring rejection reaches the socket as an error, and the unsupported close that follows
/// leaves the socket OPEN rather than latching it; the one-way `errorEmitted` latch means the
/// close's own report is not a second event.
test(
  "a refused send reports backpressure and an unsupported close does not latch",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { server, client, socket } = await attached();

    try {
      const failures: Error[] = [];
      socket.on("error", (error) => {
        failures.push(error);
      });

      for (let index = 0; index < 9; index += 1) {
        socket.send(new Uint8Array(MAX_MESSAGE_BYTES));
      }

      socket.close(1000);
      await new Promise((resolve) => setImmediate(resolve));
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ code: "ERR_BACKPRESSURE" });
      expect(socket.readyState).toBe(socket.OPEN);
      expect(closeFrameWritten(socket)).toBe(false);
    } finally {
      terminateClient(client);
      await server.dispose();
    }
  },
);
