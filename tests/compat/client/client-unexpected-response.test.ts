// The refusal a caller takes over, rather than the one the socket reports.
//
// Split from `client-redirect.test.ts` because `unexpected-response` is not about a hop at
// all: any non-101 reaches it, and the reason the event exists is that a status code alone
// cannot carry a `www-authenticate` challenge or a body.

import { expect, test } from "vitest";
import { WebSocket } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { refused } from "./client-settlement";
import { scriptedPeer } from "./redirect-peer";

test(
  "a refused response reports the status the peer sent",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const peer = await scriptedPeer({ first: 404, after: 101 });
    const socket = new WebSocket(peer.url);

    try {
      // The request and the response, which is what `ws` hands over and what a caller
      // needs in order to decide: the path tells it where it went and the status tells it
      // what it was refused with. The previous payload was a URL and a number, so
      // reading the 404's own headers was impossible.
      const seen: Array<[string, number, string | undefined]> = [];
      socket.on("unexpected-response", (request, response) =>
        seen.push([
          request.path,
          response.statusCode ?? 0,
          String(response.headers["x-peek"] ?? ""),
        ]),
      );
      // A listener takes the refusal over, so there is no error to await: the caller is
      // the one deciding now.
      expect((await refused(socket)).statusCode).toBe(404);
      expect(seen).toEqual([["/", 404, "refused-by-peer"]]);
    } finally {
      // A `terminate` on a socket that never opened reports the aborted handshake,
      // exactly as `ws` does, so the test has to be listening for it.
      socket.on("error", () => undefined);
      socket.terminate();
      await peer.close();
    }
  },
);

test(
  "an unexpected-response listener takes the refusal over",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const peer = await scriptedPeer({ first: 401, after: 101 });
    const socket = new WebSocket(peer.url);

    try {
      // The offer is only real if the response is a live `IncomingMessage`, so its body
      // is read here; `client-request-headers.test.ts` reads its headers and its path.
      const challenge = new Promise<string>((resolve) => {
        socket.on("unexpected-response", (_request, response) => {
          response.setEncoding("utf8");
          const chunks: string[] = [];
          response.on("data", (chunk: string) => chunks.push(chunk));
          response.on("end", () => resolve(chunks.join("")));
        });
      });

      expect((await refused(socket)).statusCode).toBe(401);
      expect(await challenge).toBe("token required\n");
      expect(socket.readyState).not.toBe(WebSocket.CLOSED);
    } finally {
      // A `terminate` on a socket that never opened reports the aborted handshake,
      // exactly as `ws` does, so the test has to be listening for it.
      socket.on("error", () => undefined);
      socket.terminate();
      await peer.close();
    }
  },
);
