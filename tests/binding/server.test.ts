import { expect, test } from "vitest";
import type { EngineEventKind } from "../../src/binding/native";
import { fixture, start, startAndWait, TEST_TIMEOUT_MS } from "./support";

function kinds(events: { kind: EngineEventKind }[]): EngineEventKind[] {
  return events.map((event) => event.kind);
}

test("runs the native server lifecycle", { timeout: TEST_TIMEOUT_MS }, async () => {
  const server = start({ host: "127.0.0.1", port: 0 });

  try {
    const listening = await server.waitFor("listening");
    expect(listening.server).toBe(server.handle);
    expect(listening.code).toBeGreaterThan(0);
    await server.dispose();
    expect(kinds(server.events)).toEqual(["listening", "serverClosed"]);
  } finally {
    await server.dispose();
  }
});

test(
  "tracks a live connection through the generation-checked slab",
  {
    timeout: TEST_TIMEOUT_MS,
  },
  async () => {
    const { server, port } = await startAndWait({ host: "127.0.0.1", port: 0 });
    let socket: WebSocket | undefined;

    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}/`);
      const open = await server.waitFor("connectionOpen");
      expect(open.generation).toBeGreaterThan(0);

      socket.close();
      const closed = await server.waitFor("connectionClose");
      expect(closed.index).toBe(open.index);
      expect(closed.generation).toBe(open.generation);

      await server.settle();
      expect(kinds(server.events)).toEqual(["listening", "connectionOpen", "connectionClose"]);
    } finally {
      socket?.close();
      await server.dispose();
    }
  },
);

test(
  "rejects invalid configuration without claiming a slot",
  {
    timeout: TEST_TIMEOUT_MS,
  },
  async () => {
    expect(() => fixture({ port: 70_000 })).toThrow(/InvalidPort/);
    expect(() => fixture({ port: 1, maxConnections: 0 })).toThrow(/InvalidConnectionCapacity/);
    expect(() => fixture({ port: 1, maxFrameBytes: 4_096, maxMessageBytes: 1_024 })).toThrow(
      /InvalidFrameCapacity/,
    );

    const server = fixture({ port: 0 });

    try {
      expect(server.handle).toBeGreaterThanOrEqual(0);
      // The invalid attempts must not have claimed a registry slot, so the
      // first valid server still lands in slot 0.
      expect(server.handle & 0xff).toBe(0);
    } finally {
      await server.dispose();
    }
  },
);

test("rejects non-integer configuration before the native call", () => {
  expect(() => fixture({ port: 0.5 })).toThrow(/must be a safe integer/);
  expect(() => fixture({ port: Number.NaN })).toThrow(/"port"/);
  expect(() => fixture({ port: 0, backlog: 1.5 })).toThrow(/"backlog"/);
  expect(() => fixture({ port: 0, maxConnections: Number.POSITIVE_INFINITY })).toThrow(
    /"maxConnections"/,
  );
});
