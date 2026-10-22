import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { logServerError, logServerListening, logServerPath } from "../../logging/lifecycle";
import type { ServerState } from "../../types/server";
import type { AddressInfo } from "../../types/ws";
import { emitEvent } from "../events/emitter";
import { handleUpgrade } from "./upgrade";

type UpgradeHandler = (request: IncomingMessage, socket: Duplex, head: Buffer) => void;

type ServerHandlers = {
  readonly onListening: () => void;
  readonly onError: (error: Error) => void;
  readonly onUpgrade: UpgradeHandler;
};

/// A path or pipe address is a string; a bound TCP port arrives as the info record.
function isPathAddress(address: AddressInfo | string): address is string {
  return String(address) === address;
}

/// Reports where the HTTP listener bound, once its address is readable.
function logListening(state: ServerState): void {
  const address = state.server?.address();

  if (address === null || address === undefined) {
    logServerListening(0);

    return;
  }

  if (isPathAddress(address)) {
    logServerPath(address);

    return;
  }

  logServerListening(address.port);
}

/// Routes upgrades through the same `handleUpgrade` path `noServer` callers use, so both
/// modes share one handshake implementation.
export function wireServer(state: ServerState): void {
  const httpServer = state.server;

  if (httpServer === null) return;

  const handlers: ServerHandlers = {
    onListening: (): void => {
      logListening(state);
      emitEvent(state, "listening");
    },
    onError: (error: Error): void => {
      logServerError(error);
      emitEvent(state, "error", error);
    },
    onUpgrade: (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
      handleUpgrade(state, request, socket, head, (accepted, incoming) => {
        emitEvent(state, "connection", accepted, incoming);
      });
    },
  };

  httpServer.on("listening", handlers.onListening);
  httpServer.on("error", handlers.onError);
  httpServer.on("upgrade", handlers.onUpgrade);
  state.removeListeners = (): void => {
    httpServer.removeListener("listening", handlers.onListening);
    httpServer.removeListener("error", handlers.onError);
    httpServer.removeListener("upgrade", handlers.onUpgrade);
  };
}
