// `createWebSocketStream` against a real server on each side. `ws` is the contract, so
// every scenario runs on both implementations and the transcripts have to match; the
// literal each test pins is `ws`'s own answer, so a divergence reads as a difference and a
// shared regression reads as one.

import { expect, test } from "vitest";
import { TEST_TIMEOUT_MS } from "../binding/support";
import { agree, endOrder, pauseUnderLoad, readChunks, writeChunk } from "./stream-scenarios";

test(
  "a text message is a string in object mode, and a binary message is a Buffer",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const transcript = await agree(readChunks, { readableObjectMode: true });
    expect(transcript).toEqual(["string:hello", "buffer:bin"]);
  },
);

test(
  "both messages stay buffers without readableObjectMode",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const transcript = await agree(readChunks);
    expect(transcript).toEqual(["buffer:hello", "buffer:bin"]);
  },
);

test(
  "end settles on the close frame, before the peer has answered it",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const transcript = await agree(endOrder);
    expect(transcript).toEqual(["stream:finish", "socket:close", "stream:end", "stream:close"]);
  },
);

test("a write reaches the peer as one message", { timeout: TEST_TIMEOUT_MS }, async () => {
  const transcript = await agree(writeChunk);
  expect(transcript).toEqual(["streamed"]);
});

test(
  "an unread message over the high-water mark pauses the socket",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const transcript = await agree(pauseUnderLoad);
    expect(transcript).toEqual(["true"]);
  },
);
