import { expect, test } from "vitest";
import { WebSocket } from "../../../src/index";

test("addEventListener delivers a DOM message event with the socket as target", () => {
  const socket = new WebSocket(null);
  const events: Array<{ type: string; data: unknown; target: unknown }> = [];
  socket.addEventListener("message", (event) => {
    events.push({ type: event.type, data: event.data, target: event.target });
  });
  socket.emit("message", Buffer.from("hello"), false);
  expect(events).toEqual([{ type: "message", data: "hello", target: socket }]);
});

test("binary messages stay binary in the DOM event", () => {
  const socket = new WebSocket(null);
  let data: unknown;
  socket.addEventListener("message", (event) => {
    data = event.data;
  });
  const payload = Buffer.from([1, 2, 3]);
  socket.emit("message", payload, true);
  expect(data).toBe(payload);
});

test("addEventListener deduplicates and removeEventListener detaches", () => {
  const socket = new WebSocket(null);
  let calls = 0;

  const handler = (): void => {
    calls += 1;
  };

  socket.addEventListener("message", handler);
  socket.addEventListener("message", handler);
  socket.emit("message", Buffer.from("x"), false);
  expect(calls).toBe(1);
  socket.removeEventListener("message", handler);
  socket.emit("message", Buffer.from("x"), false);
  expect(calls).toBe(1);
});

test("the once option removes the listener after the first event", () => {
  const socket = new WebSocket(null);
  let calls = 0;
  socket.addEventListener(
    "message",
    () => {
      calls += 1;
    },
    { once: true },
  );
  socket.emit("message", Buffer.from("x"), false);
  socket.emit("message", Buffer.from("x"), false);
  expect(calls).toBe(1);
});

test("object listeners receive handleEvent with themselves as this", () => {
  const socket = new WebSocket(null);
  const seen: unknown[] = [];

  const listener = {
    handleEvent(event: { type: string }): void {
      seen.push(event.type);
    },
  };

  socket.addEventListener("open", listener);
  socket.emit("open");
  expect(seen).toEqual(["open"]);
});

test("onopen attributes install and clear attribute listeners", () => {
  const socket = new WebSocket(null);
  const seen: string[] = [];

  const handler = (event: { type: string }): void => {
    seen.push(event.type);
  };

  expect(socket.onopen).toBeNull();
  socket.onopen = handler;
  expect(socket.onopen).toBe(handler);
  socket.emit("open");
  expect(seen).toEqual(["open"]);
  socket.onopen = null;
  expect(socket.onopen).toBeNull();
  socket.emit("open");
  expect(seen).toEqual(["open"]);
});

test("onclose and onerror build the ws event shapes", () => {
  const socket = new WebSocket(null);
  let close: { code: number; reason: string; wasClean: boolean } | undefined;
  let failure: { message: string; error: unknown } | undefined;
  socket.onclose = (event) => {
    close = { code: event.code, reason: event.reason, wasClean: event.wasClean };
  };

  socket.onerror = (event) => {
    failure = { message: event.message, error: event.error };
  };

  socket.emit("close", 1000, Buffer.from("done"));
  const error = new Error("broken");
  socket.emit("error", error);
  expect(close).toEqual({ code: 1000, reason: "done", wasClean: false });
  expect(failure).toEqual({ message: "broken", error });
});

test("unknown DOM event types are ignored like ws", () => {
  const socket = new WebSocket(null);
  let calls = 0;
  // SAFETY: `ping` is not a DOM event; the cast supplies the name the fixture needs the
  // listener to be registered under, and the assertion is that nothing is delivered for it.
  socket.addEventListener("ping" as never, () => {
    calls += 1;
  });
  socket.emit("ping", Buffer.from("x"));
  expect(calls).toBe(0);
});
