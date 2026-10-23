import type { EventName, Listener, Registry } from "../../src/types/events";
import type { ServerEventMap } from "../../src/types/server";
import type { BinaryType, SocketEventMap } from "../../src/types/socket";

export type SocketRegistry = Registry<SocketEventMap>;

export type ServerRegistry = Registry<ServerEventMap>;

export type SocketEventName = EventName<SocketEventMap>;

export type MessageListener = Listener<SocketEventMap, "message">;

export type OpenHandlers = Registry<SocketEventMap>["open"];

export type SocketBinaryType = BinaryType;
