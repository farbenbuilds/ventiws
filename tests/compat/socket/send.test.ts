// `send`'s failure reporting: the callback is optional, the `error` event is the
// always-available channel, and a send after close accounts bytes without writing.

import { expect, test } from "vitest";
import { sendData } from "../../../src/compat/socket/send";
import { bufferedAmountOf } from "../../../src/compat/socket/payload";
import { createSocketState } from "../../../src/compat/socket/state";
import { CLOSED, CLOSING, OPEN } from "../../../src/compat/ready-state";
import type { ReadyState } from "../../../src/types/close";
import type { SocketState } from "../../../src/types/socket";
import type { CodedError } from "../../../src/types/errors";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { attached, terminateClient } from "./socket-support";

type SendFailureCallback = (failure?: CodedError) => void;

type Detached = {
  readonly errors: Error[];
  readonly state: SocketState;
  send(data: string, options?: undefined, callback?: SendFailureCallback): void;
};

/// A socket record with no native transport, plus an error collector wired through
/// the real registry so the dispatch path is the one under test.
function detached(readyState: ReadyState): Detached {
  const state = createSocketState();
  state.readyState = readyState;
  const errors: Error[] = [];
  state.listeners.error = [(error: Error): void => void errors.push(error)];

  return {
    errors,
    state,
    send: (data, options, callback) => sendData(state, data, options, callback),
  };
}

test("a failed send on an open socket emits one coded error", () => {
  const socket = detached(OPEN);
  socket.send("hello");
  expect(socket.errors).toHaveLength(1);
  expect(socket.errors[0]).toMatchObject({ code: "ERR_INVALID_STATE" });
  expect(socket.errors[0]?.message).toMatch(/no native transport attached/);
});

test("a failed send with a callback reports through it, not the socket", async () => {
  const socket = detached(OPEN);
  await new Promise<void>((resolve) => {
    socket.send("hello", undefined, (failure?: CodedError) => {
      expect(failure?.code).toBe("ERR_INVALID_STATE");
      setImmediate(resolve);
    });
  });
  expect(socket.errors).toHaveLength(0);
});

test("a repeated failure is reported once", () => {
  const socket = detached(OPEN);
  socket.send("first");
  socket.send("second");
  socket.send("third");
  expect(socket.errors).toHaveLength(1);
});

test.each([
  ["closing", CLOSING],
  ["closed", CLOSED],
] as const)(
  "a send while %s reports through the callback and changes nothing",
  async (_name, state) => {
    const socket = detached(state);
    let reported: CodedError | undefined;
    socket.send("hello", undefined, (failure?: CodedError) => {
      reported = failure;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(reported?.message).toMatch(new RegExp(`readyState ${String(state)}`));
    expect(socket.errors).toHaveLength(0);
    // `ws`'s `sendAfterClose` accounts the refused payload on the sender's buffered bytes.
    expect(bufferedAmountOf(socket.state)).toBe(5);
  },
);

test(
  "ring overflow reaches the callback as backpressure",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { server, client, socket } = await attached();

    try {
      const failures: Error[] = [];

      await new Promise<void>((resolve) => {
        let pending = 9;

        for (let index = 0; index < 9; index += 1) {
          socket.send(new Uint8Array(32 * 1024), (error) => {
            if (error) failures.push(error);
            pending -= 1;

            if (pending === 0) resolve();
          });
        }
      });
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ code: "ERR_BACKPRESSURE" });
    } finally {
      terminateClient(client);
      await server.dispose();
    }
  },
);

/// An invalid payload throws synchronously even behind a pending Blob read, as `ws`
/// does; queueing it would move the throw off the caller's stack.
test("an invalid payload throws from send behind a pending blob read", async () => {
  const state = createSocketState();
  state.readyState = OPEN;
  const rejections: unknown[] = [];
  const record: NodeJS.UnhandledRejectionListener = (reason) => rejections.push(reason);
  let release: (buffer: ArrayBuffer) => void = () => undefined;

  const blob = {
    size: 4,
    arrayBuffer: () =>
      new Promise<ArrayBuffer>((resolve) => {
        release = resolve;
      }),
  };

  process.on("unhandledRejection", record);

  try {
    sendData(state, blob, undefined, undefined);
    expect(state.pendingSend).not.toBeNull();
    expect(() => sendData(state, {}, undefined, undefined)).toThrow(TypeError);
    release(new ArrayBuffer(4));
    await new Promise((resolve) => setImmediate(resolve));
    expect(rejections).toEqual([]);
  } finally {
    process.off("unhandledRejection", record);
  }
});
