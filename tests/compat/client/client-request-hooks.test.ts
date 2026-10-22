// `finishRequest`: the last chance to touch the opening request, which is the only point
// at which a signature or a `Cookie` can still be set. `@types/ws` declares it, so a
// TypeScript caller reaches it without a cast and reasonably believes it works; it was
// typed and inert until this suite read the request the peer received.

import { expect, test } from "vitest";
import { WebSocket } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { openWithPeer } from "./client-support";
import { rawAcceptServer } from "./raw-peer";

test("finishRequest runs before the request goes out", { timeout: TEST_TIMEOUT_MS }, async () => {
  const states: number[] = [];

  const { socket, harness } = await openWithPeer(() => undefined, undefined, undefined, {
    finishRequest: (req, websocket) => {
      states.push(websocket.readyState);
      req.end();
    },
  });

  try {
    // `ws` hands the callback the socket while it is still `CONNECTING`, because the
    // request has not gone out and so neither has the connection.
    expect(states).toEqual([WebSocket.CONNECTING]);
    expect(socket.readyState).toBe(WebSocket.OPEN);
  } finally {
    socket.terminate();
    await harness.close();
  }
});

test("a header set by finishRequest is not too late", { timeout: TEST_TIMEOUT_MS }, async () => {
  const peer = await rawAcceptServer();

  const client = new WebSocket(peer.url, {
    finishRequest: (req) => {
      // `setHeader` after `end()` is `ERR_HTTP_HEADERS_SENT`, so reaching the handshake
      // at all is the assertion: a request already sent could not have done this.
      req.setHeader("X-Finish", "yes");
      req.end();
    },
  });

  try {
    await new Promise<void>((resolve, reject) => {
      client.on("open", resolve);
      client.on("error", reject);
    });
    expect(client.readyState).toBe(WebSocket.OPEN);
  } finally {
    client.terminate();
    await peer.close();
  }
});
