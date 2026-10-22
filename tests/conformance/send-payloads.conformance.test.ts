// `send` payloads and the client's own options: a `Blob`, a compressed round trip,
// and a fragment boundary inside a multi-byte character.

import { expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "../../src/index";
import { TEST_TIMEOUT_MS } from "../binding/support";
import {
  nextSocket,
  openClient,
  upgradeHarness,
  waitFor,
} from "../compat/socket/codec-upgrade-support";
import { boundPort } from "./bound-port";

type Observed = { readonly text: string; readonly binary: boolean };

function observe(target: {
  on: (event: "message", handler: (data: Buffer, isBinary: boolean) => void) => void;
}): Observed[] {
  const seen: Observed[] = [];
  target.on("message", (data, isBinary) => seen.push({ text: data.toString(), binary: isBinary }));

  return seen;
}

/// A server that echoes, plus a client already connected to it.
async function echoConnection(): Promise<{
  send(data: string | Blob): void;
  readonly echoed: Promise<string>;
  finish(): Promise<void>;
}> {
  const server = new WebSocketServer({ port: 0, perMessageDeflate: true });
  server.on("connection", (socket) => {
    socket.on("message", (data, isBinary) => socket.send(data, { binary: isBinary }));
  });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const client = new WebSocket(`ws://127.0.0.1:${boundPort(server)}`);

  const echoed = new Promise<string>((resolve) => {
    client.once("message", (data) => resolve(data.toString()));
  });

  await new Promise<void>((resolve) => client.once("open", () => resolve()));

  return {
    send: (data) => client.send(data),
    echoed,
    finish: () => {
      client.terminate();

      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test("a compressed payload comes back whole", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { send, echoed, finish } = await echoConnection();

  try {
    // Above the 1024-byte threshold, so this is compressed unless the option says otherwise.
    const payload = "x".repeat(2048);
    send(payload);
    expect(await echoed).toBe(payload);
  } finally {
    await finish();
  }
});

test("a Blob is sent as a binary message", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { send, echoed, finish } = await echoConnection();

  try {
    send(new Blob(["blob-body"]));
    expect(await echoed).toBe("blob-body");
  } finally {
    await finish();
  }
});

test("a send issued after a blob keeps its place", { timeout: TEST_TIMEOUT_MS }, async () => {
  const order: string[] = [];
  const server = new WebSocketServer({ port: 0 });
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      order.push(data.toString());
      socket.send(data);
    });
  });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const client = new WebSocket(`ws://127.0.0.1:${boundPort(server)}`);

  try {
    await new Promise<void>((resolve) => client.once("open", () => resolve()));
    client.send(new Blob(["blob-first"]));
    client.send("then-second");
    await waitFor(() => order.length === 2);
    expect(order).toEqual(["blob-first", "then-second"]);
  } finally {
    client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test(
  "a fragment boundary inside a character still reassembles",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const harness = await upgradeHarness();
    const accepted = nextSocket(harness.server);
    const client = await openClient(harness.url);

    try {
      const socket = await accepted;
      const seen = observe(client);
      const whole = Buffer.from("héllo", "utf8");
      // The two-byte `é` starts at index 1 and ends at index 3.
      socket.send(whole.subarray(0, 2), { fin: false });
      socket.send(whole.subarray(2), { fin: true });
      await waitFor(() => seen.length === 1);
      expect(seen).toEqual([{ text: "héllo", binary: true }]);
    } finally {
      client.terminate();
      await harness.close();
    }
  },
);

test("the client honours binary and fin too", { timeout: TEST_TIMEOUT_MS }, async () => {
  const harness = await upgradeHarness();
  const accepted = nextSocket(harness.server);
  const client = new WebSocket(harness.url);
  client.on("error", () => undefined);
  await new Promise<void>((resolve) => client.once("open", () => resolve()));

  try {
    const socket = await accepted;
    const seen = observe(socket);
    client.send(Buffer.from("raw"), { binary: false });
    client.send("a", { fin: false });
    client.send("b", { fin: true });
    await waitFor(() => seen.length === 2);
    expect(seen).toEqual([
      { text: "raw", binary: false },
      { text: "ab", binary: false },
    ]);
  } finally {
    client.terminate();
    await harness.close();
  }
});
