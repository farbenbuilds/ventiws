import { STATUS_CODES, createServer as createHttpServer } from "node:http";
import { loadAddon } from "../../binding/load";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { ServerEventMap, ServerSocketConstructor, ServerState } from "../../types/server";
import type { ServerOptions, WebSocket, WebSocketServer } from "../../types/ws";
import { createEmitter } from "../events/emitter";
import { createRegistry } from "../events/registry";
import {
  DEFAULT_CLOSE_TIMEOUT,
  DEFAULT_MAX_BUFFERED_CHUNKS,
  DEFAULT_MAX_FRAGMENTS,
  DEFAULT_MAX_PAYLOAD,
} from "../options/shared";
import { addressOf, closeWebSocketServer } from "./close";
import { wireServer } from "./listeners";
import { normalizeServerOptions } from "../options/server";
import { defaultShouldHandle, handleUpgrade } from "./upgrade";
import type { UpgradeCallback } from "./accept";

const SERVER_BRAND = Symbol("ventiws.server");

/// A missing artifact thrown from a Node `upgrade` listener is an uncaught exception that
/// takes the process down, naming a build command an installed consumer does not have.
function requireAddon(): void {
  loadAddon();
}

export function isServer(value: unknown): value is WebSocketServer {
  return value instanceof Object && SERVER_BRAND in value;
}

/// Builds the `ws`-shaped server record. The listener modes match upstream: an explicit
/// `port` owns an HTTP server answering 426 to plain requests, `server` adopts the
/// caller's, and `noServer` only accepts sockets passed to `handleUpgrade`. The addon is
/// loaded here, before anything is bound, because loading is lazy elsewhere.
export function createWebSocketServer(
  socketClass: ServerSocketConstructor,
  options?: ServerOptions,
  callback?: () => void,
): WebSocketServer {
  requireAddon();

  // SAFETY: the public record reports ws's null defaults for absent options, which the
  // vendored `ServerOptions` declares as optional `undefined` instead.
  const resolved = {
    allowSynchronousEvents: true,
    autoPong: true,
    // `ws` defaults these three and reports them on `server.options`, which `@types/ws`
    // leaves undeclared; matching `ws` means inheriting the same type gap.
    maxBufferedChunks: DEFAULT_MAX_BUFFERED_CHUNKS,
    maxFragments: DEFAULT_MAX_FRAGMENTS,
    closeTimeout: DEFAULT_CLOSE_TIMEOUT,
    maxPayload: DEFAULT_MAX_PAYLOAD,
    skipUTF8Validation: false,
    perMessageDeflate: false,
    handleProtocols: null,
    clientTracking: true,
    verifyClient: null,
    noServer: false,
    backlog: null,
    server: null,
    host: null,
    path: null,
    port: null,
    WebSocket: socketClass,
    ...options,
  } as ServerOptions;

  // `ws` rewrites the shorthand `perMessageDeflate: true` to an options object on the
  // public record.
  if (resolved.perMessageDeflate === true) resolved.perMessageDeflate = {};
  const normalized = normalizeServerOptions(resolved);

  const state: ServerState = {
    options: resolved,
    normalizedOptions: normalized,
    path: resolved.path ?? "",
    // Truthiness, not `=== false`: `ws` gates on `clientTracking` being truthy, so
    // `null`, `0` and `""` all disable tracking and the `clients` key stays absent.
    clients: normalized.clientTracking ? new Set<WebSocket>() : undefined,
    webSocket: resolved.WebSocket ?? socketClass,
    server: null,
    lifecycle: "running",
    record: null,
    shouldEmitClose: false,
    removeListeners: null,
    listeners: createRegistry<ServerEventMap>(),
    maxListeners: 10,
    warned: new Set<string>(),
    target: undefined,
  };

  if (resolved.port !== null && resolved.port !== undefined) {
    const httpServer = createHttpServer((_request, response) => {
      const body = STATUS_CODES[426] ?? "Upgrade Required";
      response.writeHead(426, {
        "Content-Length": Buffer.byteLength(body),
        "Content-Type": "text/plain",
      });
      response.end(body);
    });

    state.server = httpServer;
    httpServer.listen(
      resolved.port,
      resolved.host ?? undefined,
      resolved.backlog ?? undefined,
      callback,
    );
  } else if (resolved.server) {
    state.server = resolved.server;
  }

  if (state.server !== null) wireServer(state);

  const server = {
    ...createEmitter(state),
    options: resolved,
    path: state.path,
    address: () => addressOf(state),
    close: (closeCallback?: (error?: Error) => void): void => {
      closeWebSocketServer(state, closeCallback);
    },
    handleUpgrade: (
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      upgradeCallback: UpgradeCallback,
    ): void => {
      handleUpgrade(state, request, socket, head, upgradeCallback);
    },
    shouldHandle: (request: IncomingMessage): boolean => defaultShouldHandle(state, request),
  };

  // `ws` assigns `clients` only when `clientTracking` is truthy, so the key is absent
  // rather than present-and-undefined: a caller testing `"clients" in server`, enumerating
  // `Object.keys`, or spreading the record sees the difference.
  if (state.clients !== undefined) Object.assign(server, { clients: state.clients });

  state.target = server;
  // Resolved at call time, so a later `server.shouldHandle = ...` is the
  // predicate the upgrade path consults, which is `ws`'s `this.shouldHandle(req)`.
  state.record = server;
  Object.defineProperty(server, SERVER_BRAND, { value: true });

  // SAFETY: the record implements every server member ws reads; the emitter registrations
  // return void where the vendored class declares `this`, which the facade never uses.
  return server as WebSocketServer;
}
