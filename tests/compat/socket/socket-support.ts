import { WebSocket as WsClient } from "ws";
import { packConnectionHandle } from "../../../src/binding/handle";
import { attachNativeSocket } from "../../../src/compat/socket/attach";
import { WebSocket } from "../../../src/index";
import { startAndWait, type ServerFixture } from "../../binding/support";

export type Attached = {
  readonly server: ServerFixture;
  readonly client: WsClient;
  readonly socket: WebSocket;
};

/// Terminates a `ws` client that may still be CONNECTING. In that state `ws`
/// aborts the handshake and emits `error` asynchronously, so a cleanup must
/// both absorb the throw and attach an error listener to avoid an unhandled
/// event.
export function terminateClient(client: WsClient): void {
  if (client.readyState === client.CONNECTING) {
    client.once("error", () => {});
  }

  try {
    client.terminate();
  } catch {
    // Already closing, closed, or never established.
  }
}

/// Starts a native server, connects a `ws` client, and adopts the accepted
/// connection into a compat socket record.
export async function attached(): Promise<Attached> {
  const { server, port } = await startAndWait({ host: "127.0.0.1", port: 0 });
  const client = new WsClient(`ws://127.0.0.1:${port}/`);

  try {
    const open = await server.waitFor("connectionOpen");
    const socket = new WebSocket(null);
    attachNativeSocket(socket, server.handle, packConnectionHandle(open.index, open.generation));

    return { server, client, socket };
  } catch (error) {
    terminateClient(client);
    await server.dispose();
    throw error;
  }
}
