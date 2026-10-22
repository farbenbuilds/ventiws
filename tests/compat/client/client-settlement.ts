/// The three ways a client connection can end, as promises a test can await.

import type { IncomingMessage } from "node:http";
import { WebSocket } from "../../../src/index";

/// Resolves on the socket's `error`. Asserting `readyState` after it proved nothing: the
/// abort path latched `CLOSED` without dispatching `close`, so `close` is its own promise.
export function failed(socket: WebSocket): Promise<Error> {
  return new Promise((resolve) => {
    socket.on("error", resolve);
  });
}

/// Resolves once the socket is `CLOSED`, including when that already happened.
export function closed(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();

      return;
    }

    socket.once("close", () => resolve());
  });
}

/// Resolves on `unexpected-response`, carrying the live `IncomingMessage` a caller reads for
/// a `www-authenticate` challenge or a body, neither of which a status code carries.
export function refused(socket: WebSocket): Promise<IncomingMessage> {
  return new Promise((resolve) => {
    socket.once("unexpected-response", (_request, response) => resolve(response));
  });
}
