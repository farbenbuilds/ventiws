import { createServer as createNetServer, type AddressInfo } from "node:net";
import { expect, test } from "vitest";
import { listenServer } from "../../src/binding/server";
import { fixture, start, startAndWait, TEST_TIMEOUT_MS } from "./support";

function addressPort(address: AddressInfo | string | null): number | undefined {
  return address instanceof Object ? address.port : undefined;
}

function occupyPort(): Promise<{ readonly port: number; close(): Promise<void> }> {
  return new Promise((resolve, reject) => {
    const blocker = createNetServer();

    blocker.once("error", reject);
    blocker.listen(0, "127.0.0.1", () => {
      const port = addressPort(blocker.address());

      if (port === undefined) {
        blocker.close(() => reject(new Error("failed to occupy a port")));

        return;
      }

      resolve({
        port,
        close: () =>
          new Promise((done) => {
            blocker.close(() => done());
          }),
      });
    });
  });
}

test("maxConnections caps accepted peers", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { server, port } = await startAndWait({ host: "127.0.0.1", port: 0, maxConnections: 1 });
  const first = new WebSocket(`ws://127.0.0.1:${port}/`);
  const second = new WebSocket(`ws://127.0.0.1:${port}/`);

  try {
    const refused = new Promise<void>((resolve) => {
      second.addEventListener("close", () => resolve());
      second.addEventListener("error", () => resolve());
    });

    await server.waitFor("connectionOpen");
    await refused;
    await server.settle();
    expect(server.events.filter((event) => event.kind === "connectionOpen")).toHaveLength(1);
  } finally {
    first.close();
    second.close();
    await server.dispose();
  }
});

test(
  "a failed listen reports AddressInUse and frees the port",
  { timeout: TEST_TIMEOUT_MS },
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
