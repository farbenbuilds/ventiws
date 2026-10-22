// The refusals around `permessage-deflate`: RSV1 without a negotiation, bytes that
// are not DEFLATE, and offers this build cannot satisfy. Each stops the handshake or
// the connection with the code `ws` assigns.

import { expect, test } from "vitest";
import { WebSocketServer } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { deflateServer, WS_OFFER } from "./deflate-support";
import { nextSocket, upgradeHarness } from "./codec-upgrade-support";
import { compressedTextFrame, offerExtension, readFrame } from "./raw-peer";
import { rawUpgrade, request, UPGRADE_HEADERS } from "../server/upgrade-support";
import { MASK, rawFrame } from "./refusal-support";

test(
  "a compressed frame without a negotiation is closed 1002",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    // RFC 6455 section 5.2: RSV1 is meaningful only when an extension negotiated it.
    const harness = await upgradeHarness(
      new WebSocketServer({ noServer: true, perMessageDeflate: false }),
    );

    const accepted = nextSocket(harness.server);
    const handshake = await offerExtension(harness.port, "permessage-deflate");

    try {
      const socket = await accepted;
      const events: string[] = [];
      const closed = new Promise<number>((resolve) => socket.on("close", resolve));
      socket.on("error", () => events.push("error"));
      handshake.socket.write(compressedTextFrame("hi"));
      const close = await readFrame(handshake.socket);
      expect(close.opcode).toBe(0x8);
      expect(close.payload.readUInt16BE(0)).toBe(1002);
      expect(await closed).toBe(1002);
      expect(events).toEqual(["error"]);
    } finally {
      handshake.socket.destroy();
      await harness.close();
    }
  },
);

test(
  "a payload that is not a DEFLATE stream is ERR_INVALID_COMPRESSED_DATA",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const harness = await upgradeHarness(deflateServer());
    const accepted = nextSocket(harness.server);
    const handshake = await offerExtension(harness.port, WS_OFFER);

    try {
      expect(handshake.status).toBe(101);
      const socket = await accepted;

      const seen = new Promise<{ code: string; closeCode: number }>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("no refusal within the timeout")),
          TEST_TIMEOUT_MS,
        );

        socket.on("error", (error: Error & { code?: string }) => {
          clearTimeout(timer);
          socket.on("close", (closeCode: number) =>
            resolve({ code: error.code ?? "ERR_NONE", closeCode }),
          );
        });
      });

      handshake.socket.write(
        rawFrame([0xc1, 0x80 | 8, ...MASK, 0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa, 0xf9, 0xf8, 0xf7]),
      );
      expect(await seen).toEqual({ code: "ERR_INVALID_COMPRESSED_DATA", closeCode: 1007 });
    } finally {
      handshake.socket.destroy();
      await harness.close();
    }
  },
);

test.each([
  ["no configuration can satisfy the offer", "permessage-deflate; client_max_window_bits=1"],
  [
    "a server window this build cannot emit",
    "permessage-deflate; server_max_window_bits=8, permessage-deflate; server_max_window_bits=10",
  ],
  [
    "a server window this compressor cannot produce",
    "permessage-deflate; server_max_window_bits=10",
  ],
  ["a malformed header", "permessage-deflate; p=(1)"],
])(
  "an offer with %s is answered with 400",
  { timeout: TEST_TIMEOUT_MS },
  async (_name, extension) => {
    const harness = await upgradeHarness(deflateServer());

    try {
      const result = await rawUpgrade(
        harness.port,
        request("/", { ...UPGRADE_HEADERS, "Sec-WebSocket-Extensions": extension }),
      );

      expect(result.status).toBe(400);
    } finally {
      await harness.close();
    }
  },
);
