// A send issued while a Blob read is in flight.
//
// The read defers the next send, but `ws` still throws from `send` for a payload
// `Buffer.from` refuses, and a synchronous throw raised inside the queue has to reach
// the callback or the socket rather than becoming an unhandled rejection.

import { expect, test } from "vitest";
import { sendData } from "../../../src/compat/socket/send";
import { bufferedAmountOf } from "../../../src/compat/socket/payload";
import { createSocketState } from "../../../src/compat/socket/state";
import { CLOSED, OPEN } from "../../../src/compat/ready-state";

type DeferredBlob = {
  readonly blob: { readonly size: number; arrayBuffer(): Promise<ArrayBuffer> };
  release(): void;
};

/// A Blob-shaped read a test releases by hand, so the queue stays pending while the
/// assertions run.
function deferredBlob(size: number): DeferredBlob {
  let release: (buffer: ArrayBuffer) => void = () => undefined;
  return {
    blob: {
      size,
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          release = resolve;
        }),
    },
    release: () => release(new ArrayBuffer(size)),
  };
}

test("an invalid payload throws from send even behind a pending blob read", async () => {
  const state = createSocketState();
  state.readyState = OPEN;
  const rejections: unknown[] = [];
  const record = (reason: unknown): void => {
    rejections.push(reason);
  };
  process.on("unhandledRejection", record);
  const reading = deferredBlob(4);
  try {
    sendData(state, reading.blob, undefined, undefined);
    expect(state.pendingSend).not.toBeNull();
    // `ws` throws synchronously for `{}`; queueing the send would move the throw off
    // the caller's stack and leave the rejection unobserved.
    expect(() => sendData(state, {}, undefined, undefined)).toThrow(TypeError);
    reading.release();
    await new Promise((resolve) => setImmediate(resolve));
    expect(rejections).toEqual([]);
  } finally {
    process.off("unhandledRejection", record);
  }
});

test("a synchronous throw from queued work is routed to the callback", async () => {
  // The getter succeeds for the queueing `isBlob` check and throws for the read the queued
  // work performs, which is the shape of any encode failure once `send` has returned.
  const state = createSocketState();
  state.readyState = OPEN;
  state.pendingSend = Promise.resolve();
  let failure: unknown;
  let reads = 0;
  const blob = {
    size: 1,
    get arrayBuffer(): () => Promise<ArrayBuffer> {
      reads += 1;
      if (reads > 1) throw new Error("read failed");
      return () => Promise.resolve(new ArrayBuffer(0));
    },
  };
  sendData(state, blob, undefined, (error?: unknown) => {
    failure = error;
  });
  await new Promise((resolve) => setImmediate(resolve));
  expect((failure as Error | undefined)?.message).toBe("read failed");
});

test("a blob sent while not open is accounted without being read", () => {
  const state = createSocketState();
  state.readyState = CLOSED;
  let reads = 0;
  const blob = {
    size: 7,
    arrayBuffer: (): Promise<ArrayBuffer> => {
      reads += 1;
      return Promise.resolve(new ArrayBuffer(0));
    },
  };
  sendData(state, blob, undefined, undefined);
  // `ws`'s `sendAfterClose` adds `data.size` and never reads the blob.
  expect(reads).toBe(0);
  expect(bufferedAmountOf(state)).toBe(7);
});
