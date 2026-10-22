// The `Blob` payload and the compressed round trip.
//
// A `Blob` threw, though `ws` accepts one and its own API reference lists it as a valid
// payload. The wire-level `compress` and `mask` cases live in
// `send-frame-options.conformance.test.ts`, because they read a frame rather than a
// message.

import { expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "../../src/index";
import { TEST_TIMEOUT_MS } from "../binding/support";
import { waitFor } from "../compat/socket/codec-upgrade-support";
import { boundPort } from "./bound-port";

/// The payloads these cases need a round trip to prove.
type EchoPayload = string | Blob;

type EchoConnection = {
  send(data: EchoPayload): void;
  readonly echoed: Promise<string>;
  finish(): Promise<void>;
};

/// A server that echoes, plus a client already connected to it. Shared by the cases that need
/// a message to come back rather than a frame to be read.
async function echoConnection(): Promise<EchoConnection> {
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
    send: (data) => {
      client.send(data);
    },
    echoed,
    finish: () => {
      client.terminate();

      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test("a compressed payload comes back whole", { timeout: TEST_TIMEOUT_MS }, async () => {
  // Above the 1024-byte threshold, so this is compressed unless the option says otherwise.
  const { send, echoed, finish } = await echoConnection();

  try {
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
  // `ws` puts the blob read on its own sender queue, so the two arrive in the order they were
  // called. Reading the blob and letting the next send overtake it is the other order, and a
  // caller streaming a file as blobs depends on this one.
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
