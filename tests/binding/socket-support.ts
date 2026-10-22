import { packConnectionHandle } from "../../src/binding/handle";
import { startAndWait, type ServerFixture } from "./support";

export type ConnectedSocket = {
  readonly server: ServerFixture;
  readonly connection: bigint;
  readonly socket: WebSocket;
};

/// Starts a server, connects a client, and resolves the generation-checked
/// connection handle the socket operations consume.
export async function connectedSocket(): Promise<ConnectedSocket> {
  const { server, port } = await startAndWait({ host: "127.0.0.1", port: 0 });
  const socket = new WebSocket(`ws://127.0.0.1:${port}/`);

  try {
    const open = await server.waitFor("connectionOpen");

    return { server, connection: packConnectionHandle(open.index, open.generation), socket };
  } catch (error) {
    socket.close();
    await server.dispose();
    throw error;
  }
}
