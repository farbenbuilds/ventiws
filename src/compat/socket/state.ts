import type { SocketEventMap, SocketState } from "../../types/socket";
import type { WebSocket } from "../../types/ws";
import {
  DEFAULT_CLOSE_TIMEOUT,
  DEFAULT_MAX_BUFFERED_CHUNKS,
  DEFAULT_MAX_FRAGMENTS,
  DEFAULT_MAX_PAYLOAD,
} from "../options/shared";
import { createRegistry } from "../events/registry";
import { CONNECTING } from "../ready-state";

const SOCKET_STATES = new WeakMap<object, SocketState>();

export function brandSocket(socket: WebSocket, state: SocketState): void {
  SOCKET_STATES.set(socket, state);
}

export function isSocket(value: unknown): value is WebSocket {
  return value instanceof Object && SOCKET_STATES.has(value);
}

export function socketStateOf(socket: WebSocket): SocketState | undefined {
  return SOCKET_STATES.get(socket);
}

/// Defaults mirror `ws`: a server-side socket starts CONNECTING with the abnormal close
/// code latched until a close frame or the transport supplies a better one.
export function createSocketState(): SocketState {
  return {
    url: "",
    protocol: "",
    extensions: "",
    binaryType: "nodebuffer",
    readyState: CONNECTING,
    isPaused: false,
    isServer: true,
    closeCode: 1006,
    closeReason: Buffer.alloc(0),
    closeFrameSent: false,
    closeFrameReceived: false,
    fragmentsOpen: false,
    errorEmitted: false,
    attachment: null,
    transport: null,
    codec: null,
    closeTimer: null,
    closeTimeout: DEFAULT_CLOSE_TIMEOUT,
    allowSynchronousEvents: true,
    deliveryPaused: false,
    pendingInput: [],
    maxBufferedChunks: DEFAULT_MAX_BUFFERED_CHUNKS,
    validateUtf8: true,
    maxPayload: DEFAULT_MAX_PAYLOAD,
    maxFragments: DEFAULT_MAX_FRAGMENTS,
    cancelHandshake: null,
    pendingSend: null,
    bufferedExtra: 0,
    compressible: false,
    threshold: 0,
    autoPong: true,
    generateMask: null,
    maskScratch: Buffer.alloc(4),
    listeners: createRegistry<SocketEventMap>(),
    maxListeners: 10,
    warned: new Set<string>(),
    target: undefined,
  };
}
