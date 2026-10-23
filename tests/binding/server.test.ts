import { expect, test } from "vitest";
import type { NativeServerConfig } from "../../src/binding/native";
import { closeServer, engineLimits, finalizeServer, listenServer } from "../../src/binding/server";
import { fixture, start, startAndWait, TEST_TIMEOUT_MS } from "./support";

type InvalidConfig = readonly [string, NativeServerConfig, RegExp];

const INVALID_CONFIGS: readonly InvalidConfig[] = [
  ["a port above uint16", { port: 70_000 }, /InvalidPort/],
  ["zero accepted connections", { port: 1, maxConnections: 0 }, /InvalidConnectionCapacity/],
  [
    "a frame cap below the message cap",
    { port: 1, maxFrameBytes: 4_096, maxMessageBytes: 1_024 },
    /InvalidFrameCapacity/,
  ],
  ["a fractional port", { port: 0.5 }, /must be a safe integer/],
  ["a NaN port", { port: Number.NaN }, /"port"/],
  ["a fractional backlog", { port: 0, backlog: 1.5 }, /"backlog"/],
  [
    "an infinite connection cap",
    { port: 0, maxConnections: Number.POSITIVE_INFINITY },
    /"maxConnections"/,
  ],
];

test.each(INVALID_CONFIGS)("rejects %s before the native call", (_name, config, message) => {
  expect(() => fixture(config)).toThrow(message);
});

test(
  "a rejected configuration does not claim a server slot",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const server = fixture({ port: 0 });

    try {
      expect(server.handle & 0xff).toBe(0);
    } finally {
      await server.dispose();
    }
  },
);

test("runs create, listen, close, and finalize", { timeout: TEST_TIMEOUT_MS }, async () => {
  const server = start({ host: "127.0.0.1", port: 0 });

  try {
    const listening = await server.waitFor("listening");

    expect(listening.server).toBe(server.handle);
    expect(listening.code).toBeGreaterThan(0);
    await server.dispose();
    // Exactly one serverClosed: a duplicate would make a caller close twice.
    expect(server.events.map((event) => event.kind)).toEqual(["listening", "serverClosed"]);
  } finally {
    await server.dispose();
  }
});

test(
  "tracks a connection through the generation-checked slab",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { server, port } = await startAndWait({ host: "127.0.0.1", port: 0 });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/`);

    try {
      const open = await server.waitFor("connectionOpen");

      expect(open.generation).toBeGreaterThan(0);
      socket.close();
      const closed = await server.waitFor("connectionClose");

      expect(closed.index).toBe(open.index);
      expect(closed.generation).toBe(open.generation);
      await server.settle();
      expect(server.events.map((event) => event.kind)).toEqual([
        "listening",
        "connectionOpen",
        "connectionClose",
      ]);
    } finally {
      socket.close();
      await server.dispose();
    }
  },
);

test(
  "finalize is refused until the close event has drained",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const server = fixture({ host: "127.0.0.1", port: 0 });

    try {
      expect(() => finalizeServer(server.handle)).toThrow(/ServerNotClosed/);
      closeServer(server.handle);
      expect(() => finalizeServer(server.handle)).toThrow(/EventsPending/);
      await server.waitFor("serverClosed");
      finalizeServer(server.handle);
    } finally {
      await server.dispose();
    }
  },
);

test(
  "double listen, double close, and a stale handle are typed errors",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const server = start({ host: "127.0.0.1", port: 0 });

    try {
      await server.waitFor("listening");
      expect(() => listenServer(server.handle)).toThrow(/InvalidServerState/);
      closeServer(server.handle);
      expect(() => closeServer(server.handle)).toThrow(/InvalidServerState/);
      await server.waitFor("serverClosed");
      await server.dispose();

      expect(() => listenServer(server.handle)).toThrow(/UnknownServer/);
      expect(() => closeServer(server.handle)).toThrow(/UnknownServer/);
      expect(() => finalizeServer(server.handle)).toThrow(/UnknownServer/);
    } finally {
      await server.dispose();
    }
  },
);

test("the compiled limits are coherent", () => {
  const limits = engineLimits();

  expect(limits.maxPayloadBytes).toBeGreaterThanOrEqual(100 * 1024 * 1024);
  expect(limits.messageBytes).toBeGreaterThanOrEqual(65_536);
  // RFC 6455 section 5.5 caps a control frame at 125 bytes.
  expect(limits.frameBytes).toBeGreaterThanOrEqual(125);
  expect(limits.frameBytes).toBeLessThanOrEqual(limits.messageBytes);
  expect(limits.maxFragments).toBe(16_384);
  expect(limits.inboundSlots).toBeGreaterThan(limits.outboundSlots);
  expect(limits.connectionCapacity).toBeGreaterThan(limits.outboundSlots);
});
