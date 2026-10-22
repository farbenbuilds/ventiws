// The options a server hands to the sockets it creates.
//
// Split from `client-options.test.ts` because this is the server's own record rather than
// a client's: an operator who set `autoPong: false` or a deadline on the server expects
// every accepted socket to obey it.

import { expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "../../../src/index";
import type { RuntimeServerOptions } from "../server-options";
import { boundPort } from "../address-support";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { waitFor } from "./client-support";

test(
  "a server socket inherits its server's close deadline and autoPong",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    // A socket created by the server must obey the options the server was given, not the
    // defaults: an operator who set `autoPong: false` for every connection got it for the
    // ones the facade created too.
    const options: RuntimeServerOptions = {
      port: 0,
      autoPong: false,
      closeTimeout: 200,
    };

    const server = new WebSocketServer(options);

    await new Promise<void>((resolve) => {
      server.once("listening", () => resolve());
    });
    const pings: string[] = [];
    const pongs: string[] = [];

    const accepted = new Promise<WebSocket>((resolve) => {
      server.once("connection", (socket) => {
        socket.on("ping", (data) => pings.push(data.toString()));
        socket.on("pong", (data) => pongs.push(data.toString()));
        resolve(socket);
      });
    });

    const client = await new Promise<WebSocket>((resolve, reject) => {
      const peer = new WebSocket(`ws://127.0.0.1:${boundPort(server.address())}`);
      peer.once("open", () => resolve(peer));
      peer.once("error", reject);
    });

    try {
      const socket = await accepted;
      client.ping("beat");
      await waitFor(() => pings.length === 1);
      // The server socket received the ping and, with `autoPong: false`, did not answer.
      expect(pongs).toEqual([]);
      socket.close();
    } finally {
      client.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  },
);
