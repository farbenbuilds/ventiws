// The `WS_ERR_*` codes a malformed frame produces, and the UTF-8 option that accepts the bytes.

import { expect, test } from "vitest";
import { WebSocketServer } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { clientFrames } from "./client-frames";
import { nextSocket, upgradeHarness, waitFor } from "./codec-upgrade-support";
import { openRawClient } from "../handshake";
import { MASK, rawFrame, refused } from "./refusal-support";

function withReservedBit(bit: number): Buffer {
  const frame = Buffer.from(clientFrames([{ opcode: 0x1, payload: Buffer.from("hi") }]));
  frame[0] = frame.readUInt8(0) | bit;

  return frame;
}

type FrameCase = readonly [
  name: string,
  bytes: () => Buffer,
  code: string,
  closeCode: number,
  message: string | undefined,
  ctor: string | undefined,
];

const CASES: ReadonlyArray<FrameCase> = [
  [
    "an unmasked frame",
    () => Buffer.from([0x81, 0x02, 0x68, 0x69]),
    "WS_ERR_EXPECTED_MASK",
    1002,
    "Invalid WebSocket frame: MASK must be set",
    "RangeError",
  ],
  [
    "a fragmented control frame",
    () => rawFrame([0x09, 0x80 | 1, ...MASK, 0x78]),
    "WS_ERR_EXPECTED_FIN",
    1002,
    "Invalid WebSocket frame: FIN must be set",
    undefined,
  ],
  [
    "a control frame over 125 bytes",
    () =>
      rawFrame([0x89, 0x80 | 126, 0x00, 0x7e, ...MASK, ...Array.from({ length: 126 }, () => 0x78)]),
    "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH",
    1002,
    undefined,
    undefined,
  ],
  [
    "RSV2",
    () => withReservedBit(0x20),
    "WS_ERR_UNEXPECTED_RSV_2_3",
    1002,
    "Invalid WebSocket frame: RSV2 and RSV3 must be clear",
    undefined,
  ],
  [
    "RSV1 with nothing negotiated",
    () => withReservedBit(0x40),
    "WS_ERR_UNEXPECTED_RSV_1",
    1002,
    undefined,
    undefined,
  ],
  [
    "a reserved opcode",
    () => rawFrame([0x83, 0x80 | 1, ...MASK, 0x78]),
    "WS_ERR_INVALID_OPCODE",
    1002,
    undefined,
    undefined,
  ],
  [
    "a close payload with a reserved code",
    () => rawFrame([0x88, 0x80 | 2, ...MASK, 0x03, 0xee]),
    "WS_ERR_INVALID_CLOSE_CODE",
    1002,
    undefined,
    undefined,
  ],
  [
    "invalid UTF-8 text",
    () => clientFrames([{ opcode: 0x1, payload: Buffer.from([0x41, 0x80, 0x42]) }]),
    "WS_ERR_INVALID_UTF8",
    1007,
    "Invalid WebSocket frame: invalid UTF-8 sequence",
    "Error",
  ],
];

test.each(CASES)(
  "%s is refused with %s",
  { timeout: TEST_TIMEOUT_MS },
  async (
    _name: string,
    bytes: () => Buffer,
    code: string,
    closeCode: number,
    message: string | undefined,
    ctor: string | undefined,
  ) => {
    const seen = await refused(new WebSocketServer({ noServer: true }), (send) => send(bytes()));
    expect(seen.code).toBe(code);
    expect(seen.closeCode).toBe(closeCode);

    if (message !== undefined) expect(seen.message).toBe(message);

    if (ctor !== undefined) expect(seen.ctor).toBe(ctor);
  },
);

const INVALID_TEXT = Buffer.from([0x41, 0x80, 0x42]);
const INVALID_REASON_CLOSE = Buffer.from([0x03, 0xe8, 0xff, 0xfe]);

test(
  "skipUTF8Validation delivers invalid text and an invalid close reason",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const server = new WebSocketServer({ noServer: true, skipUTF8Validation: true });
    const harness = await upgradeHarness(server);
    const accepted = nextSocket(server);
    const raw = await openRawClient(harness.port);

    try {
      const socket = await accepted;
      const messages: string[] = [];
      socket.on("message", (data) => messages.push(data.toString()));
      raw.write(clientFrames([{ opcode: 0x1, payload: INVALID_TEXT }]));
      await waitFor(() => messages.length === 1);
      expect(messages[0]).toBe("A�B");

      const closed = new Promise<Buffer>((resolve) => {
        socket.on("close", (code: number, reason: Buffer) => {
          expect(code).toBe(1000);
          resolve(reason);
        });
      });

      raw.write(clientFrames([{ opcode: 0x8, payload: INVALID_REASON_CLOSE }]));
      expect([...(await closed)]).toEqual([0xff, 0xfe]);
    } finally {
      raw.destroy();
      await harness.close();
    }
  },
);
