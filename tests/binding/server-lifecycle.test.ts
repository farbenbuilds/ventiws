import { expect, test } from "vitest";
import { closeServer, finalizeServer, listenServer } from "../../src/binding/server";
import { fixture, start, TEST_TIMEOUT_MS } from "./support";

test(
  "closing a created server emits serverClosed exactly once",
  {
    timeout: TEST_TIMEOUT_MS,
  },
  async () => {
    const server = fixture({ host: "127.0.0.1", port: 0 });

    try {
      closeServer(server.handle);
      await server.waitFor("serverClosed");
      await server.settle();
      const closes = server.events.filter((event) => event.kind === "serverClosed");
      expect(closes).toHaveLength(1);
    } finally {
      await server.dispose();
    }
  },
);

test("finalize before close is a typed error", { timeout: TEST_TIMEOUT_MS }, async () => {
  const server = fixture({ host: "127.0.0.1", port: 0 });

  try {
    expect(() => finalizeServer(server.handle)).toThrow(/ServerNotClosed/);
  } finally {
    await server.dispose();
  }
});

test(
  "finalize is refused while the close event is still queued",
  {
    timeout: TEST_TIMEOUT_MS,
  },
  async () => {
    const server = fixture({ host: "127.0.0.1", port: 0 });

    try {
      closeServer(server.handle);
      expect(() => finalizeServer(server.handle)).toThrow(/EventsPending/);
      await server.waitFor("serverClosed");
      finalizeServer(server.handle);
    } finally {
      await server.dispose();
    }
  },
);

test("double close and re-listen are typed errors", { timeout: TEST_TIMEOUT_MS }, async () => {
  const server = start({ host: "127.0.0.1", port: 0 });

  try {
    await server.waitFor("listening");
    expect(() => listenServer(server.handle)).toThrow(/InvalidServerState/);
    closeServer(server.handle);
    expect(() => closeServer(server.handle)).toThrow(/InvalidServerState/);
    await server.waitFor("serverClosed");
  } finally {
    await server.dispose();
  }
});

test("a handle from a finalized server is rejected", { timeout: TEST_TIMEOUT_MS }, async () => {
  const server = fixture({ host: "127.0.0.1", port: 0 });
  const stale = server.handle;
  await server.dispose();
  expect(() => listenServer(stale)).toThrow(/UnknownServer/);
  expect(() => closeServer(stale)).toThrow(/UnknownServer/);
  expect(() => finalizeServer(stale)).toThrow(/UnknownServer/);
});
