// A peer that reads the opening request and holds the 101 back.
//
// Its own module because the delay is the fixture: a test drives a `close()` or
// `terminate()` against an in-flight handshake and then races the answer, which no
// peer that completes normally can express.

import { createServer, type Server, type Socket } from "node:net";
import { acceptValue } from "../handshake";
import { boundPort } from "../address-support";

export type DelayedPeer = {
  readonly url: string;
  /// Resolves once the opening request is read and left unanswered, which is the moment a
  /// client is certainly still `CONNECTING`.
  readonly requestRead: Promise<void>;
  /// Writes the 101 the fixture was holding back.
  accept(): void;
  /// Resolves when the client's connection is gone, however it ended.
  readonly gone: Promise<void>;
  close(): Promise<void>;
};

/// A peer that reads the opening request and delays the 101, so a test can drive a
/// `close()` or `terminate()` against the in-flight handshake and then race the answer.
export async function delayedAcceptServer(): Promise<DelayedPeer> {
  const sockets: Socket[] = [];
  let key = "";
  let announce: () => void = () => undefined;

  const requestRead = new Promise<void>((resolve) => {
    announce = resolve;
  });

  let departed: () => void = () => undefined;

  const gone = new Promise<void>((resolve) => {
    departed = resolve;
  });

  const server: Server = createServer((socket) => {
    sockets.push(socket);
    let buffered = Buffer.alloc(0);
    socket.on("error", () => undefined);
    socket.on("close", () => departed());
    socket.on("data", (chunk: Buffer) => {
      if (key !== "") return;
      buffered = Buffer.concat([buffered, chunk]);
      const end = buffered.indexOf("\r\n\r\n");

      if (end === -1) return;
      const head = buffered.subarray(0, end).toString("latin1");
      key = /sec-websocket-key: (.+)\r\n/i.exec(head)?.[1]?.trim() ?? "";
      announce();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  return {
    url: `ws://127.0.0.1:${boundPort(server.address())}`,
    requestRead,
    accept: () => {
      sockets[0]?.write(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptValue(key)}\r\n\r\n`,
      );
    },
    gone,
    close: () => {
      for (const socket of sockets) socket.destroy();

      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}
