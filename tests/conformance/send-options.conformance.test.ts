// `send`'s shaping options on the wire: `binary`, `fin`, `compress`, and `mask`.
// The peer is a real `ws` client, except where a frame must be read directly.

import { expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "../../src/index";
import type { CodedError } from "../../src/types/errors";
import { TEST_TIMEOUT_MS } from "../binding/support";
import {
  nextSocket,
  openClient,
  upgradeHarness,
  waitFor,
} from "../compat/socket/codec-upgrade-support";
import { offerExtension, readFrame } from "../compat/socket/raw-peer";
import { boundPort } from "./bound-port";

type Observed = { readonly text: string; readonly binary: boolean };

function observe(target: {
  on: (event: "message", handler: (data: Buffer, isBinary: boolean) => void) => void;
}): Observed[] {
  const seen: Observed[] = [];
  target.on("message", (data, isBinary) => seen.push({ text: data.toString(), binary: isBinary }));

  return seen;
}

test("the binary option chooses the opcode", { timeout: TEST_TIMEOUT_MS }, async () => {
  const harness = await upgradeHarness();
  const accepted = nextSocket(harness.server);
  const client = await openClient(harness.url);

  try {
    const socket = await accepted;
    const seen = observe(client);
    // Autodetected both ways, then overridden both ways.
    socket.send("abc");
    socket.send("xyz", { binary: true });
    socket.send(Buffer.from("raw"), { binary: false });
    socket.send(Buffer.from("bin"));
    await waitFor(() => seen.length === 4);
    expect(seen).toEqual([
      { text: "abc", binary: false },
      { text: "xyz", binary: true },
      { text: "raw", binary: false },
      { text: "bin", binary: true },
    ]);
  } finally {
    client.terminate();
    await harness.close();
  }
});

test("the fin option fragments an outbound message", { timeout: TEST_TIMEOUT_MS }, async () => {
  const harness = await upgradeHarness();
  const accepted = nextSocket(harness.server);
  const client = await openClient(harness.url);

  try {
    const socket = await accepted;
    const seen = observe(client);
    socket.send("one", { fin: false });
    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    expect(seen).toEqual([]);
    socket.send("two", { fin: true });
    await waitFor(() => seen.length === 1);
    expect(seen).toEqual([{ text: "onetwo", binary: false }]);
  } finally {
    client.terminate();
    await harness.close();
  }
});

test("a send with no options is a complete message", { timeout: TEST_TIMEOUT_MS }, async () => {
  const harness = await upgradeHarness();
  const accepted = nextSocket(harness.server);
  const client = await openClient(harness.url);

  try {
    const socket = await accepted;
    const seen = observe(client);
    socket.send("one");
    socket.send("two");
    await waitFor(() => seen.length === 2);
    expect(seen.map((entry) => entry.text)).toEqual(["one", "two"]);
  } finally {
    client.terminate();
    await harness.close();
  }
});

test(
  "compress: false leaves RSV1 clear above the threshold",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    // 2048 bytes is over the 1024-byte threshold, so only the option prevents compression.
    const harness = await upgradeHarness(new WebSocketServer({ port: 0, perMessageDeflate: true }));
    const accepted = nextSocket(harness.server);
    const handshake = await offerExtension(harness.port, "permessage-deflate");

    try {
      expect(handshake.status).toBe(101);
      const socket = await accepted;
      socket.send("y".repeat(2048), { compress: false });
      const frame = await readFrame(handshake.socket);
      expect(frame.rsv1).toBe(false);
      expect(frame.inflated.toString()).toBe("y".repeat(2048));
    } finally {
      handshake.socket.destroy();
      await harness.close();
    }
  },
);

test(
  "mask: false is honoured, so the peer refuses the frame",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    // RFC 6455 section 5.1 requires a client to mask; a server closes on one that does not.
    const server = new WebSocketServer({ port: 0 });
    const accepted = new Promise<WebSocket>((resolve) => server.once("connection", resolve));
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const client = new WebSocket(`ws://127.0.0.1:${boundPort(server)}`);

    try {
      await new Promise<void>((resolve) => client.once("open", () => resolve()));
      const socket = await accepted;
      const failure = new Promise<CodedError>((resolve) => socket.once("error", resolve));
      client.send("abc", { mask: false });
      expect((await failure).code).toBe("WS_ERR_EXPECTED_MASK");
    } finally {
      client.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
