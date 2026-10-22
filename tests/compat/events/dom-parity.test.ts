import { expect, test } from "vitest";
import { WebSocket } from "../../../src/index";

test("attribute assignment does not crash next to a raw listener", () => {
  const socket = new WebSocket(null);
  let raw = 0;
  let attribute = 0;
  socket.on("message", () => {
    raw += 1;
  });
  socket.onmessage = () => {
    attribute += 1;
  };

  expect(socket.onmessage).toBeInstanceOf(Function);
  socket.emit("message", Buffer.from("x"), false);
  expect(raw).toBe(1);
  expect(attribute).toBe(1);
});

test("raw and DOM registrations stay disjoint like ws", () => {
  const socket = new WebSocket(null);
  let raw = 0;
  let dom = 0;

  const rawHandler = (): void => {
    raw += 1;
  };

  const domHandler = (): void => {
    dom += 1;
  };

  socket.on("open", rawHandler);
  socket.addEventListener("open", domHandler);

  socket.removeEventListener("open", rawHandler);
  socket.off("open", domHandler);
  socket.emit("open");
  expect(raw).toBe(1);
  expect(dom).toBe(1);

  socket.removeEventListener("open", domHandler);
  socket.off("open", rawHandler);
  socket.emit("open");
  expect(raw).toBe(1);
  expect(dom).toBe(1);
});

test("the once option follows truthiness like ws", () => {
  const socket = new WebSocket(null);
  let calls = 0;
  // SAFETY: `ws` reads `once` by truthiness; `1` is the non-boolean fixture the declaration
  // forbids, and the assertion is that the listener is still removed after one event.
  socket.addEventListener(
    "message",
    () => {
      calls += 1;
    },
    { once: 1 as never },
  );
  socket.emit("message", Buffer.from("x"), false);
  socket.emit("message", Buffer.from("x"), false);
  expect(calls).toBe(1);
});
