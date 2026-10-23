import { WebSocket as WsClient, WebSocketServer as WsServer } from "ws";
import { packConnectionHandle } from "../../src/binding/handle";
import { attachNativeSocket } from "../../src/compat/socket/attach";
import { WebSocket } from "../../src/index";
import { startAndWait } from "../binding/support";
import type { ServerFixture } from "../binding/support";
import { terminateClient } from "../compat/socket/socket-support";
import { boundPort } from "./bound-port";

export type Closable = {
  close(code?: number, reason?: CloseReason): void;
  ping(data?: ControlPayload): void;
  pong(data?: ControlPayload): void;
  readonly readyState: number;
};

/// The close-reason values the parity table exercises, including the out-of-type
/// ones `ws` refuses: an over-long buffer, a mismatched view, and a plain object.
export type CloseReason =
  | string
  | number
  | Uint8Array
  | Float32Array
  | Uint16Array
  | readonly never[]
  | Record<string, never>
  | undefined;

type ControlPayload = string | Buffer | ArrayBuffer | Uint8Array;

export type Outcome = {
  readonly threw: boolean;
  readonly readyState: number;
  readonly name: string;
  readonly message: string;
};

export type Compared = { readonly expected: Outcome; readonly actual: Outcome };

/// One accepted connection, on either implementation.
export type Fixture = {
  readonly socket: Closable;
  readonly client: WsClient;
  readonly server: ServerFixture | null;
  readonly dispose: () => Promise<void>;
};

/// Stands up a `ws` server and hands back the accepted server-side socket, which
/// is the reference every comparison runs against first.
export async function wsAccepted(): Promise<Fixture> {
  const server = new WsServer({ port: 0 });

  const accepted = new Promise<WsClient>((resolve) => {
    server.on("connection", (socket: WsClient) => resolve(socket));
  });

  await new Promise<void>((resolve) => {
    server.once("listening", resolve);
  });
  const port = boundPort(server);
  const client = new WsClient(`ws://127.0.0.1:${port}/`);
  client.on("error", () => {});
  const socket = await accepted;

  return {
    socket,
    client,
    server: null,
    dispose: async () => {
      client.terminate();
      socket.terminate();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

/// Starts a native server, connects a `ws` client, and adopts the accepted
/// connection into a compat socket, so the same scenario can run on ventiws.
export async function adopted(): Promise<Fixture> {
  const { server, port } = await startAndWait({ host: "127.0.0.1", port: 0 });
  const client = new WsClient(`ws://127.0.0.1:${port}/`);

  try {
    const open = await server.waitFor("connectionOpen");
    const socket = new WebSocket(null);
    attachNativeSocket(socket, server.handle, packConnectionHandle(open.index, open.generation));

    return {
      socket,
      client,
      server,
      dispose: async () => {
        terminateClient(client);
        await server.dispose();
      },
    };
  } catch (error) {
    terminateClient(client);
    await server.dispose();
    throw error;
  }
}
