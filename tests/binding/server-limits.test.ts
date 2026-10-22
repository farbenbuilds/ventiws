import { expect, test } from "vitest";
import { listenServer } from "../../src/binding/server";
import { occupyPort } from "./port-support";
import { fixture, start, startAndWait, TEST_TIMEOUT_MS } from "./support";

test("maxConnections caps accepted peers", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { server, port } = await startAndWait({ host: "127.0.0.1", port: 0, maxConnections: 1 });
  let first: WebSocket | undefined;
  let second: WebSocket | undefined;

  try {
    first = new WebSocket(`ws://127.0.0.1:${port}/`);
    second = new WebSocket(`ws://127.0.0.1:${port}/`);

    const refused = new Promise<void>((resolve) => {
      second?.addEventListener("close", () => resolve());
      second?.addEventListener("error", () => resolve());
    });

    await server.waitFor("connectionOpen");
    await refused;
    await server.settle();
    const opens = server.events.filter((event) => event.kind === "connectionOpen");
    expect(opens).toHaveLength(1);
  } finally {
    first?.close();
    second?.close();
    await server.dispose();
  }
});

test(
  "a failed listen stays recoverable and frees the port",
  {
    timeout: TEST_TIMEOUT_MS,
  },
  async () => {
    const blocker = await occupyPort();
    const server = fixture({ host: "127.0.0.1", port: blocker.port });

    try {
      expect(() => listenServer(server.handle)).toThrow(/AddressInUse/);
    } finally {
      await blocker.close();
      await server.dispose();
    }

    const replacement = start({ host: "127.0.0.1", port: blocker.port });

    try {
      await replacement.waitFor("listening");
    } finally {
      await replacement.dispose();
    }
  },
);
