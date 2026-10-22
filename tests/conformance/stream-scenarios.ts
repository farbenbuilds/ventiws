import type { DuplexOptions } from "node:stream";
import { expect } from "vitest";
import { waitFor } from "../compat/socket/codec-upgrade-support";
import {
  describeChunk,
  until,
  upstreamFixture,
  ventiwsFixture,
  within,
  type StreamFixture,
  type Transcript,
} from "./stream-support";

type Build = (options?: DuplexOptions) => Promise<StreamFixture>;

export type Scenario = (fixture: StreamFixture) => Promise<Transcript>;

/// Above the 16 KiB readable high-water mark, so a buffered chunk makes `push` go false.
const OVERSIZE = 64 * 1024;

/// One scenario on both legs, asserting they agree, and handing back the transcript so the
/// caller can pin it. `ws` runs first, as `parity-support.ts` does, so a ventiws failure can
/// never be the reason a reference server is left listening.
export async function agree(scenario: Scenario, options?: DuplexOptions): Promise<Transcript> {
  const expected = await run(upstreamFixture, scenario, options);
  const actual = await run(ventiwsFixture, scenario, options);
  expect(actual).toEqual(expected);

  return actual;
}

async function run(build: Build, scenario: Scenario, options?: DuplexOptions): Promise<Transcript> {
  const fixture = await build(options);

  try {
    return await scenario(fixture);
  } finally {
    await fixture.dispose();
  }
}

/// One text message and one binary message, as the stream reports them.
export async function readChunks(fixture: StreamFixture): Promise<Transcript> {
  const seen: Transcript = [];

  const two = new Promise<void>((resolve) => {
    fixture.stream.on("data", (chunk: string | Buffer) => {
      seen.push(describeChunk(chunk));

      if (seen.length === 2) resolve();
    });
  });

  fixture.client.send("hello");
  fixture.client.send(Buffer.from("bin"));
  await within(two, "two messages");

  return seen;
}

/// What the stream wrote, as the peer received it: a write is a `send`, so the only thing
/// that can differ is whether the bytes reached the peer as one message.
export async function writeChunk(fixture: StreamFixture): Promise<Transcript> {
  const seen: Transcript = [];

  const received = new Promise<void>((resolve) => {
    fixture.client.on("message", (data: Buffer) => {
      seen.push(data.toString());
      resolve();
    });
  });

  fixture.stream.write("streamed");
  await within(received, "the written message");

  return seen;
}

/// `stream.end()`, then every event that follows, in the order it happened. `finish` is the
/// one under test: `ws` settles it when the close frame has been written, and the socket's
/// `close` is the peer answering that frame, which is a later event by contract. The
/// readable side is drained, because a stream nobody reads never emits `end` or `close` and
/// the teardown those two assert would go untested.
export async function endOrder(fixture: StreamFixture): Promise<Transcript> {
  const seen: Transcript = [];
  fixture.stream.on("finish", () => seen.push("stream:finish"));
  fixture.stream.on("end", () => seen.push("stream:end"));
  fixture.stream.on("error", () => seen.push("stream:error"));
  fixture.stream.on("close", () => seen.push("stream:close"));
  fixture.socket.on("close", () => seen.push("socket:close"));
  fixture.stream.resume();
  fixture.stream.end();
  await until(seen, "stream:close");

  return seen;
}

/// A message the application has not read, larger than the readable high-water mark. The
/// chunk is buffered rather than delivered, so `push` goes false and the socket is paused;
/// the stub could not show this, because a synchronous `push` into a draining reader never
/// returned false.
export async function pauseUnderLoad(fixture: StreamFixture): Promise<Transcript> {
  fixture.client.send(Buffer.alloc(OVERSIZE));
  await waitFor(() => fixture.socket.isPaused);

  return [String(fixture.socket.isPaused)];
}
