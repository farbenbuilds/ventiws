import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { ServerState } from "../../types/server";
import type { VerifyClientCallbackAsync, VerifyClientCallbackSync } from "../../types/ws";
import { isStringValue } from "../socket/argument-kind";
import {
  abortHandshake,
  abortOrEmit,
  isSecure,
  KEY_PATTERN,
  parseProtocols,
  requestHeader,
} from "./handshake";
import { completeUpgrade, type UpgradeCallback } from "./accept";
import { attachHandshakeError } from "./handshake-error";

/// Its runtime `origin` can be undefined even though the vendored type declares `string`.
type VerifyClientRequest = Parameters<VerifyClientCallbackSync>[0];

export function defaultShouldHandle(state: ServerState, request: IncomingMessage): boolean {
  const path = state.options.path;

  if (!path) return true;
  const url = request.url ?? "";
  const index = url.indexOf("?");

  return (index !== -1 ? url.slice(0, index) : url) === path;
}

/// `ws` evaluates `this.shouldHandle(request)`: an assigned `server.shouldHandle` function
/// decides, and `defaultShouldHandle` applies only when there is none.
export function shouldHandle(state: ServerState, request: IncomingMessage): boolean {
  const assigned = state.record?.shouldHandle;

  if (assigned !== undefined) return assigned(request);

  return defaultShouldHandle(state, request);
}

/// Validation failures route through the `wsClientError` policy.
export function handleUpgrade(
  state: ServerState,
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  callback: UpgradeCallback,
): void {
  attachHandshakeError(socket);

  const key = request.headers["sec-websocket-key"];
  const upgrade = request.headers.upgrade;
  const version = Number(request.headers["sec-websocket-version"]);

  if (request.method !== "GET") {
    abortOrEmit(state, request, socket, 405, "Invalid HTTP method");

    return;
  }

  if (!isStringValue(upgrade) || upgrade.toLowerCase() !== "websocket") {
    abortOrEmit(state, request, socket, 400, "Invalid Upgrade header");

    return;
  }

  if (!isStringValue(key) || !KEY_PATTERN.test(key)) {
    abortOrEmit(state, request, socket, 400, "Missing or invalid Sec-WebSocket-Key header");

    return;
  }

  if (version !== 13 && version !== 8) {
    abortOrEmit(state, request, socket, 400, "Missing or invalid Sec-WebSocket-Version header", {
      "Sec-WebSocket-Version": "13, 8",
    });

    return;
  }

  if (!shouldHandle(state, request)) {
    abortHandshake(socket, 400);

    return;
  }

  const protocols = parseProtocols(state, request, socket);

  if (protocols === undefined) return;
  // Read at upgrade time so a post-construction assignment on `server.options` applies.
  const verify = state.options.verifyClient ?? null;

  if (verify === null) {
    completeUpgrade(state, request, socket, head, key, protocols, callback);

    return;
  }

  // SAFETY: @types/ws declares `origin: string`, while ws forwards the raw header, which can
  // be absent; the cast keeps that observable behavior at the callback boundary.
  const info = {
    origin: requestHeader(request, version === 8 ? "sec-websocket-origin" : "origin"),
    secure: isSecure(request),
    req: request,
  } as VerifyClientRequest;

  if (verify.length === 2) {
    // SAFETY: `ws` tells the two verifyClient forms apart by declared arity, which the
    // vendored union cannot express; two parameters is the callback form.
    const asynchronous = verify as VerifyClientCallbackAsync;

    asynchronous(info, (verified, code, message, headers) => {
      if (!verified) {
        abortHandshake(socket, code || 401, message, headers);

        return;
      }

      completeUpgrade(state, request, socket, head, key, protocols, callback);
    });

    return;
  }

  // SAFETY: the arity check above proved the remaining union member is the sync form.
  if (!(verify as VerifyClientCallbackSync)(info)) {
    abortHandshake(socket, 401);

    return;
  }

  completeUpgrade(state, request, socket, head, key, protocols, callback);
}
