import { expect, test } from "vitest";
import { loadAddon } from "../../src/binding/load";
import { loadEngineAddon } from "../../src/binding/load-engine";

const SERVER_FUNCTIONS = [
  "createServer",
  "listenServer",
  "closeServer",
  "finalizeServer",
  "serverDroppedEvents",
  "serverDroppedMessages",
  "serverUndeliveredMessages",
] as const;

const SOCKET_FUNCTIONS = [
  "sendSocket",
  "closeSocket",
  "pauseSocket",
  "resumeSocket",
  "pumpSocket",
  "takeSocketMessage",
  "purgeSocketMessage",
  "socketBufferedAmount",
] as const;

test("the development addon reports HTTP/3 support", () => {
  expect(loadEngineAddon().http3Available()).toBe(true);
});

test("the development addon links the same engine release as the public addon", () => {
  expect(loadEngineAddon().engineVersion()).toBe(loadAddon().engineVersion());
});

test.each(SERVER_FUNCTIONS)("the development addon exposes %s", (name) => {
  expect(loadEngineAddon()[name]).toBeTypeOf("function");
});

test.each(SOCKET_FUNCTIONS)("the development addon exposes %s", (name) => {
  expect(loadEngineAddon()[name]).toBeTypeOf("function");
});

test("the development addon carries the codec the public facade runs", () => {
  expect(loadEngineAddon().codecCreate).toBeTypeOf("function");
});

/// Both artifacts compile the same `capacities.zig`, so a mismatch means the
/// split built one half from a different tree and the harness would measure a
/// different cap than the codec enforces.
test("the development addon reports the same compiled capacities", () => {
  expect(loadEngineAddon().engineLimits()).toEqual(loadAddon().engineLimits());
});
