// The client subprotocol list and the constructor's overloads. `ws` is the reference
// for the header and for the refusals.

import { createServer } from "node:net";
import { WebSocket as WsClient } from "ws";
import { expect, test } from "vitest";
import { WebSocket } from "../../src/index";
import type { ClientOptions } from "../../src/index";
import { TEST_TIMEOUT_MS } from "../binding/support";
import { rawAcceptServer } from "../compat/client/raw-peer";
import { boundPort } from "./bound-port";

type ClientLike = {
  terminate(): void;
  on(event: "error", listener: (error: Error) => void): void;
};

function protocolHeader(head: string): string | undefined {
  for (const line of head.split("\r\n")) {
    if (line.toLowerCase().startsWith("sec-websocket-protocol:")) {
      return line.slice(line.indexOf(":") + 1).trim();
    }
  }

  return undefined;
}

/// Sends one opening handshake and resolves with the offered protocol header.
function offer(build: (url: string) => ClientLike): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => {
      socket.once("data", (data) => {
        socket.destroy();
        server.close();
        resolve(protocolHeader(data.toString("latin1")));
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const socket = build(`ws://127.0.0.1:${boundPort(server)}/`);
      socket.on("error", (error: Error) => {
        socket.terminate();
        server.close();
        reject(error);
      });
    });
  });
}

type ProtocolOptions = ClientOptions & {
  readonly protocols: string | string[];
};

function protocolOptions(protocols: string | string[]): ClientOptions {
  const options: ProtocolOptions = { protocols };

  return options;
}

/// Each row: the name, the constructor argument, the options record, and the header.
/// `ws` wraps a scalar and lets the constructor argument override the option.
type ProtocolCase = readonly [
  name: string,
  protocols: string | string[] | undefined,
  options: ProtocolOptions,
  header: string,
];

const PROTOCOLS: ReadonlyArray<ProtocolCase> = [
  ["the option as a scalar", undefined, { protocols: "foo" }, "foo"],
  ["the option as a list", undefined, { protocols: ["foo", "bar"] }, "foo,bar"],
  ["the argument list over the option", ["foo", "bar"], { protocols: "baz" }, "foo,bar"],
  ["the argument scalar over the option", "foo", { protocols: ["bar"] }, "foo"],
];

test.each(PROTOCOLS)(
  "%s reaches the wire like ws",
  { timeout: TEST_TIMEOUT_MS },
  async (_name, protocols, options, header) => {
    expect(await offer((url) => new WsClient(url, protocols, options))).toBe(header);
    expect(await offer((url) => new WebSocket(url, protocols, options))).toBe(header);
  },
);

test("the promoted options record carries protocols", { timeout: TEST_TIMEOUT_MS }, async () => {
  const options = protocolOptions(["foo"]);
  expect(await offer((url) => new WsClient(url, options))).toBe("foo");
  expect(await offer((url) => new WebSocket(url, options))).toBe("foo");
});

/// `new WebSocket(address, null)` is `[null]` to the parser, which `ws` refuses.
test("a null subprotocol argument is refused like ws", () => {
  // SAFETY: runtime `null` is the value under test; the overload types exclude it.
  const nullProtocols = null as never;

  const reference = (() => {
    try {
      new WsClient("ws://127.0.0.1:1/", nullProtocols);

      return "none";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  })();

  expect(() => new WebSocket("ws://127.0.0.1:1/", nullProtocols)).toThrowError(reference);
});

test(
  "the two-argument constructor is the options overload",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const peer = await rawAcceptServer();

    try {
      const socket = new WebSocket(peer.url, { handshakeTimeout: 5_000 });
      socket.on("error", () => undefined);
      await new Promise<void>((resolve) => socket.once("open", () => resolve()));
      expect(socket.readyState).toBe(WebSocket.OPEN);
      socket.close();
    } finally {
      await peer.close();
    }
  },
);

test("a subprotocol list is not promoted", () => {
  expect(() => new WebSocket("ws://127.0.0.1:1/", ["chat", "chat"])).toThrowError(
    /invalid or duplicated subprotocol/i,
  );
});
