// The opening handshake, spoken by hand where a test needs bytes `ws` will not frame.

import { connect, type Socket } from "node:net";
import { createHash, randomBytes } from "node:crypto";

/// RFC 6455 section 4.2.2's GUID applied to the peer's key.
export function acceptValue(key: string): string {
  return createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
}

/// Reads a response's head off a socket, leaving the socket at the frame stream.
function readResponse(socket: Socket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let buffered: Buffer = Buffer.alloc(0);

    const onData = (chunk: Buffer): void => {
      buffered = Buffer.concat([buffered, chunk]);
      const end = buffered.indexOf("\r\n\r\n");

      if (end === -1) return;
      socket.off("data", onData);
      resolve(buffered.subarray(end + 4));
    };

    socket.on("data", onData);
    socket.on("error", reject);
  });
}

/// A client handshake written by hand, so a test can put its own frames on the wire.
export async function openRawClient(port: number): Promise<Socket> {
  const socket = await new Promise<Socket>((resolve, reject) => {
    const opened = connect({ port, host: "127.0.0.1" }, () => resolve(opened));
    opened.on("error", reject);
  });

  socket.write(
    [
      "GET / HTTP/1.1",
      "Host: 127.0.0.1",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
      "Sec-WebSocket-Version: 13",
      "",
      "",
    ].join("\r\n"),
  );
  await readResponse(socket);

  return socket;
}
