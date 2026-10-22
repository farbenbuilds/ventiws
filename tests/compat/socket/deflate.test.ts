// RFC 7692 on the wire: `ws` reads what this build compresses and RSV1 only appears above the threshold.
import { WebSocketServer as WsServer } from "ws";
import { expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { boundPort } from "../address-support";
import { COMPRESSIBLE, deflateServer, NEGOTIATED, SMALL, WS_OFFER } from "./deflate-support";
import { nextSocket, openClient, upgradeHarness } from "./codec-upgrade-support";
import { offerExtension, readFrame } from "./raw-peer";

test(
  "a ws client's compressed message reaches a ventiws socket",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const harness = await upgradeHarness(deflateServer());
    const accepted = nextSocket(harness.server);
    const client = await openClient(harness.url);

    try {
      const socket = await accepted;
      expect(socket.extensions).toBe(NEGOTIATED);

      const message = new Promise<string>((resolve) =>
        socket.once("message", (data) => resolve(data.toString())),
      );

      client.send(COMPRESSIBLE);
      expect(await message).toBe(COMPRESSIBLE);
    } finally {
      client.terminate();
      await harness.close();
    }
  },
);

test(
  "a ventiws socket's compressed message reaches a ws client",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const harness = await upgradeHarness(deflateServer());
    const accepted = nextSocket(harness.server);
    const client = await openClient(harness.url);

    try {
      const socket = await accepted;

      const message = new Promise<string>((resolve) =>
        client.once("message", (data) => resolve(data.toString())),
      );

      socket.send(COMPRESSIBLE);
      expect(await message).toBe(COMPRESSIBLE);
    } finally {
      client.terminate();
      await harness.close();
    }
  },
);

test(
  "a ventiws client negotiates against a ws server and compresses",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const server = new WsServer({ port: 0, perMessageDeflate: true });
    await new Promise<void>((resolve) => server.once("listening", resolve));

    try {
      const received = new Promise<string>((resolve) => {
        server.once("connection", (peer) => {
          peer.once("message", (data) => resolve(data.toString()));
        });
      });

      const client = new WebSocket(`ws://127.0.0.1:${boundPort(server.address())}`);
      await new Promise<void>((resolve, reject) => {
        client.once("open", resolve);
        client.once("error", reject);
      });
      expect(client.extensions).toContain("permessage-deflate");
      expect(client.extensions).toContain("no_context_takeover");
      client.send(COMPRESSIBLE);
      expect(await received).toBe(COMPRESSIBLE);
      client.terminate();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

test(
  "a message above the threshold is compressed and a small one is not",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const harness = await upgradeHarness(deflateServer());
    const accepted = nextSocket(harness.server);
    const handshake = await offerExtension(harness.port, WS_OFFER);

    try {
      expect(handshake.status).toBe(101);
      expect(handshake.headers["sec-websocket-extensions"]).toBe(NEGOTIATED);
      const socket = await accepted;
      socket.send(COMPRESSIBLE);
      const large = await readFrame(handshake.socket);
      expect(large.rsv1).toBe(true);
      expect(large.inflated.toString()).toBe(COMPRESSIBLE);
      socket.send(SMALL);
      const small = await readFrame(handshake.socket);
      expect(small.rsv1).toBe(false);
      expect(small.payload.toString()).toBe(SMALL);
    } finally {
      handshake.socket.destroy();
      await harness.close();
    }
  },
);

test("a server with the extension off never sets RSV1", { timeout: TEST_TIMEOUT_MS }, async () => {
  const harness = await upgradeHarness(
    new WebSocketServer({ noServer: true, perMessageDeflate: false }),
  );

  const accepted = nextSocket(harness.server);
  const handshake = await offerExtension(harness.port, WS_OFFER);

  try {
    expect(handshake.status).toBe(101);
    expect(handshake.headers["sec-websocket-extensions"]).toBeUndefined();
    const socket = await accepted;
    expect(socket.extensions).toBe("");
    socket.send(COMPRESSIBLE);
    expect((await readFrame(handshake.socket)).rsv1).toBe(false);
  } finally {
    handshake.socket.destroy();
    await harness.close();
  }
});
