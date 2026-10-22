// The two `send` options proven on the wire rather than through a round trip:
// `compress: false` and `mask: false`.
//
// A `ws` peer inflates transparently, so an echoed payload comes back whole whether
// or not the frame was compressed, which is exactly the bug. `mask: false` is the odd
// one: `ws` honours it, and the peer then refuses the frame, because RFC 6455 section
// 5.1 requires a client to mask and a server to close on one that does not.

import { expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "../../src/index";
import { TEST_TIMEOUT_MS } from "../binding/support";
import { offerExtension, readFrame } from "../compat/socket/raw-peer";
import { nextSocket, upgradeHarness } from "../compat/socket/codec-upgrade-support";
import type { CodedError } from "../../src/types/errors";
import { boundPort } from "./bound-port";

test(
  "compress: false leaves RSV1 clear on a payload above the threshold",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    // 2048 bytes is over the 1024-byte threshold, so only the option stands between
    // this and a compressed frame.
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
    // RFC 6455 section 5.1: a client must mask. `ws` honours the option and its own server
    // answers `WS_ERR_EXPECTED_MASK` and closes, which is what a ventiws server does here too.
    // Before the fix the frame went out masked and neither side could tell the option had been
    // ignored, so a caller who set it had no way to find out.
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
