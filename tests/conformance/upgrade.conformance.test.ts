import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { connect } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocketServer as WsServer } from "ws";
import { expect, test } from "vitest";
import { WebSocketServer } from "../../src/index";
import type { ServerOptions } from "../../src/index";
import { boundPort } from "./bound-port";

const KEY = "dGhlIHNhbXBsZSBub25jZQ==";

type ServerLike = {
  handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (...args: unknown[]) => void,
  ): void;
  close(callback?: () => void): void;
};

function request(path: string, headers: Record<string, string> = {}, method = "GET"): string {
  const lines = [`${method} ${path} HTTP/1.1`, "Host: 127.0.0.1"];

  for (const [name, value] of Object.entries(headers)) lines.push(`${name}: ${value}`);
  lines.push("", "");

  return lines.join("\r\n");
}

const UPGRADE_HEADERS = {
  Upgrade: "websocket",
  Connection: "Upgrade",
  "Sec-WebSocket-Key": KEY,
  "Sec-WebSocket-Version": "13",
};

/// Resolves once the status line, the header block, and any declared body have
/// all arrived, so a rejection keeps the full body `ws` writes.
function responseComplete(data: string): boolean {
  const headerEnd = data.indexOf("\r\n\r\n");

  if (headerEnd === -1 || !data.startsWith("HTTP/1.1 ")) return false;

  if (data.startsWith("HTTP/1.1 101")) return true;
  const length = /^content-length:\s*(\d+)$/im.exec(data.slice(0, headerEnd));

  if (length === null) return true;

  return data.length >= headerEnd + 4 + Number(length[1]);
}

function rawUpgrade(port: number, raw: string, waitMs = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => {
      socket.write(raw);
    });

    let data = "";
    let settled = false;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(data);
    };

    socket.setTimeout(waitMs, finish);
    socket.on("end", finish);
    socket.on("close", finish);
    socket.on("data", (chunk) => {
      data += chunk.toString("latin1");

      if (responseComplete(data)) finish();
    });
    socket.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

async function capture(server: ServerLike, raw: string): Promise<string> {
  const httpServer = createServer();
  httpServer.on("upgrade", (incoming, socket, head) => {
    server.handleUpgrade(incoming, socket, head, () => {});
  });
  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", resolve);
  });
  const port = boundPort(httpServer);

  try {
    return await rawUpgrade(port, raw);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        httpServer.close(() => {
          resolve();
        });
      });
    });
  }
}

const SCENARIOS: ReadonlyArray<readonly [string, string, ServerOptions]> = [
  ["valid handshake", request("/", UPGRADE_HEADERS), { noServer: true }],
  ["path mismatch", request("/other", UPGRADE_HEADERS), { noServer: true, path: "/ws" }],
  [
    "bad version",
    request("/", { ...UPGRADE_HEADERS, "Sec-WebSocket-Version": "12" }),
    { noServer: true },
  ],
  ["non-GET", request("/", UPGRADE_HEADERS, "POST"), { noServer: true }],
  [
    "verifyClient rejection",
    request("/", UPGRADE_HEADERS),
    { noServer: true, verifyClient: () => false },
  ],
  [
    "async verifyClient rejection",
    request("/", UPGRADE_HEADERS),
    {
      noServer: true,
      verifyClient: (_info, callback) => {
        callback(false, 403, "Nope", { "X-Reason": "denied" });
      },
    },
  ],
  [
    "invalid subprotocol header",
    request("/", { ...UPGRADE_HEADERS, "Sec-WebSocket-Protocol": "bad protocol" }),
    { noServer: true },
  ],
];

test.each(SCENARIOS)("%s matches ws byte for byte", async (_name, raw, options) => {
  // SAFETY: The scenario record is intentionally shared by both libraries; their option
  // types differ only in callback aliases, and each constructor validates the record.
  const expected = await capture(new WsServer(options as never), raw);
  // SAFETY: The same record through the ventiws constructor, which must answer byte for byte.
  const actual = await capture(new WebSocketServer(options as never), raw);
  expect(actual).toBe(expected);
});
