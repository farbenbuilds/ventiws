// The client handshake after the socket exists: `upgrade`, `unexpected-response`, and the deadline.

import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Socket } from "node:net";
import { expect, test } from "vitest";
import { WebSocket } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { boundPort } from "../address-support";
import { refused } from "./client-settlement";
import { CLOSE_DEADLINE_MS, settle } from "./handshake-support";
import { scriptedPeer } from "./redirect-peer";
import { undeclared } from "./undeclared";

test("upgrade reports the 101 before the socket opens", { timeout: TEST_TIMEOUT_MS }, async () => {
  const peer = await scriptedPeer({ first: 101, after: 101 });

  const socket = new WebSocket(
    peer.url,
    undefined,
    undeclared({ closeTimeout: CLOSE_DEADLINE_MS }),
  );

  try {
    const seen = new Promise<IncomingMessage>((resolve) => {
      socket.once("upgrade", resolve);
    });

    await new Promise<void>((resolve) => socket.once("open", () => resolve()));
    const response = await seen;
    expect(response.statusCode).toBe(101);
    expect(response.headers.upgrade).toBe("websocket");
  } finally {
    await settle(socket);
    await peer.close();
  }
});

test(
  "unexpected-response hands over the status, headers, and body",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const peer = await scriptedPeer({ first: 401, after: 101 });

    const socket = new WebSocket(
      peer.url,
      undefined,
      undeclared({ closeTimeout: CLOSE_DEADLINE_MS }),
    );

    try {
      const taken = new Promise<[string, number, string, string]>((resolve) => {
        socket.once("unexpected-response", (request, response) => {
          response.setEncoding("utf8");
          const chunks: string[] = [];
          response.on("data", (chunk: string) => chunks.push(chunk));
          response.on("end", () =>
            resolve([
              request.path ?? "",
              response.statusCode ?? 0,
              String(response.headers["x-peek"] ?? ""),
              chunks.join(""),
            ]),
          );
        });
      });

      expect((await refused(socket)).statusCode).toBe(401);
      expect(await taken).toEqual(["/", 401, "refused-by-peer", "token required\n"]);
      expect(socket.readyState).not.toBe(WebSocket.CLOSED);
    } finally {
      socket.on("error", () => undefined);
      socket.terminate();
      await peer.close();
    }
  },
);

/// An HTTP server that accepts and says nothing, so the handshake stays open.
async function silentPeer(): Promise<{ url: string; close: () => Promise<void> }> {
  const openSockets: Socket[] = [];

  const server: Server = createServer((_request, response) =>
    response.on("error", () => undefined),
  );

  server.on("connection", (socket) => {
    openSockets.push(socket);
    socket.on("error", () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    url: `ws://127.0.0.1:${boundPort(server.address())}/`,
    close: () => {
      for (const socket of openSockets) socket.destroy();

      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function firstEvent(socket: WebSocket, withinMs: number): Promise<string> {
  return new Promise((resolve) => {
    socket.once("open", () => resolve("open"));
    socket.once("error", () => resolve("error"));
    setTimeout(() => resolve("timeout"), withinMs);
  });
}

test(
  "a peer that never answers is refused at the deadline",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const peer = await silentPeer();
    const socket = new WebSocket(peer.url, { handshakeTimeout: 120 });

    try {
      const outcome = await new Promise<string>((resolve) => {
        socket.once("error", (error: Error) => resolve(error.message));
        setTimeout(() => resolve("(no error)"), 1500);
      });

      expect(outcome).toBe("Opening handshake has timed out");
    } finally {
      socket.terminate();
      await peer.close();
    }
  },
);

test.each([
  ["zero", { handshakeTimeout: 0 }],
  ["absent", {}],
] as const)(
  "handshakeTimeout %s is no deadline",
  { timeout: TEST_TIMEOUT_MS },
  async (_name, options) => {
    const peer = await silentPeer();
    const socket = new WebSocket(peer.url, options);

    try {
      expect(await firstEvent(socket, 700)).toBe("timeout");
      expect(socket.readyState).toBe(WebSocket.CONNECTING);
    } finally {
      socket.terminate();
      await peer.close();
    }
  },
);
