// How a client connection opens and ends: the events, their order, and the failures
// a caller sees when the peer is not a WebSocket server.

import { expect, test } from "vitest";
import { WebSocket } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { boundPort } from "../address-support";
import { openWithPeer, waitFor } from "./client-support";
import { delayedAcceptServer } from "./delayed-accept-peer";

test(
  "a client reaches open and the server sees a connection",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { socket, peer, harness } = await openWithPeer(() => undefined);

    try {
      expect(peer).toBeDefined();
      expect(socket.readyState).toBe(WebSocket.OPEN);
      // `ws` reports the parsed URL; a bare authority gains the `/` a URL always has.
      expect(socket.url).toBe(`${harness.url}/`);
    } finally {
      socket.terminate();
      await harness.close();
    }
  },
);

/// A refused dial and a non-101 response both report the transport failure and close.
test.each([
  ["a closed port", "ECONNREFUSED"],
  ["a 404 response", "404"],
] as const)(
  "%s is reported and the socket closes",
  { timeout: TEST_TIMEOUT_MS },
  async (_name, needle) => {
    let close = async (): Promise<void> => undefined;
    let url = "ws://127.0.0.1:1/";

    if (needle === "ECONNREFUSED") {
      const { createServer } = await import("node:net");
      const probe = createServer();
      await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
      url = `ws://127.0.0.1:${boundPort(probe.address())}/`;
      await new Promise<void>((resolve) => probe.close(() => resolve()));
    } else {
      const { createServer } = await import("node:http");
      const http = createServer((_request, response) => response.writeHead(404).end());
      await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
      url = `ws://127.0.0.1:${boundPort(http.address())}/`;
      close = () => new Promise<void>((resolve) => http.close(() => resolve()));
    }

    const socket = new WebSocket(url);
    const failure = new Promise<Error>((resolve) => socket.on("error", resolve));

    try {
      const error = await failure;

      if (needle === "ECONNREFUSED") expect(error).toHaveProperty("code", "ECONNREFUSED");
      else expect(error.message).toContain(needle);
      expect(socket.readyState).toBe(WebSocket.CLOSED);
    } finally {
      await close();
    }
  },
);

/// `close()` and `terminate()` on a CONNECTING socket abort the request, so a late 101
/// cannot report an `upgrade` on a socket the caller already closed.
test.each(["close", "terminate"])(
  "%s while CONNECTING aborts the request and refuses the late 101",
  { timeout: TEST_TIMEOUT_MS },
  async (operation) => {
    const peer = await delayedAcceptServer();
    const socket = new WebSocket(peer.url);
    const events: string[] = [];
    const errors: Error[] = [];
    let code = -1;
    let reason: Buffer = Buffer.from([1]);

    const closed = new Promise<void>((resolve) => {
      socket.on("upgrade", () => events.push("upgrade"));
      socket.on("error", (error) => {
        events.push("error");
        errors.push(error);
      });
      socket.on("close", (closeCode: number, closeReason: Buffer) => {
        code = closeCode;
        reason = closeReason;
        resolve();
      });
    });

    let departed = false;
    void peer.gone.then(() => {
      departed = true;
    });

    try {
      await peer.requestRead;

      if (operation === "close") socket.close();
      else socket.terminate();
      await closed;
      expect(errors.map((error) => error.message)).toEqual([
        "WebSocket was closed before the connection was established",
      ]);
      expect(code).toBe(1006);
      expect(reason).toHaveLength(0);
      expect(socket.readyState).toBe(WebSocket.CLOSED);
      peer.accept();
      await waitFor(() => departed || events.includes("upgrade"));
      expect(departed).toBe(true);
      expect(events).toEqual(["error"]);
    } finally {
      await peer.close();
    }
  },
);
