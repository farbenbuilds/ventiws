// The client subprotocol list, compared against `ws` 8.22.0. The new `protocols` option
// is the only way to state protocols through the options record, the constructor argument
// must win over it, and an invalid argument must still be refused. Nothing here needs a
// server: a peer that reads the request head and hangs up is the whole observation.

import { createServer } from "node:net";
import { WebSocket as WsClient } from "ws";
import { expect, test } from "vitest";
import { WebSocket } from "../../src/index";
import { TEST_TIMEOUT_MS } from "../binding/support";
import { undeclared } from "../compat/client/undeclared";

type ClientLike = {
  terminate(): void;
  on(event: "error", listener: (error: Error) => void): unknown;
};

/// Sends one opening handshake at a peer that reads the head and hangs up, and resolves
/// with the offered `Sec-WebSocket-Protocol` value. The refusal the client then reports
/// is the expected end of the exchange; a dial that fails earlier rejects the test.
function offer(build: (url: string) => ClientLike): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const listener = createServer((socket) => {
      socket.once("data", (data) => {
        socket.destroy();
        listener.close();
        resolve(protocolHeader(data.toString("latin1")));
      });
    });
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const socket = build(`ws://127.0.0.1:${port}/`);
      socket.on("error", (error) => {
        socket.terminate();
        listener.close();
        reject(error);
      });
    });
  });
}

function protocolHeader(head: string): string | undefined {
  for (const line of head.split("\r\n")) {
    if (line.toLowerCase().startsWith("sec-websocket-protocol:")) {
      return line.slice(line.indexOf(":") + 1).trim();
    }
  }
  return undefined;
}

/// The constructor's thrown error as a comparable record. A constructor that does not
/// throw is reported rather than left to dial in the background.
function refusal(build: () => unknown): { name: string; message: string } {
  try {
    const socket = build() as ClientLike;
    socket.on("error", () => undefined);
    return { name: "none", message: "no throw" };
  } catch (error) {
    const failure = error as Error;
    return { name: failure.constructor.name, message: failure.message };
  }
}

/// Each row: the name, the constructor's subprotocol argument, the options record, and
/// the header both implementations must produce. `ws` wraps a scalar and lets the
/// constructor argument override the option (`websocket.js:75`).
type ProtocolCase = readonly [
  name: string,
  protocols: string | string[] | undefined,
  options: Record<string, unknown>,
  header: string,
];

const CASES: ReadonlyArray<ProtocolCase> = [
  ["the option as a scalar", undefined, { protocols: "foo" }, "foo"],
  ["the option as a list", undefined, { protocols: ["foo", "bar"] }, "foo,bar"],
  ["the argument list over the option", ["foo", "bar"], { protocols: "baz" }, "foo,bar"],
  ["the argument scalar over the option", "foo", { protocols: ["bar"] }, "foo"],
];

test.each(CASES)(
  "%s reaches the wire like ws",
  { timeout: TEST_TIMEOUT_MS },
  async (_name, protocols, options, header) => {
    const reference = await offer((url) => new WsClient(url, protocols, undeclared(options)));
    const actual = await offer((url) => new WebSocket(url, protocols, undeclared(options)));
    expect(reference).toBe(header);
    expect(actual).toBe(header);
  },
);

/// The two-argument overload: an options record in the subprotocol slot is promoted by
/// `ws`, and its `protocols` field is the list that goes on the wire.
test("the promoted options record carries protocols", { timeout: TEST_TIMEOUT_MS }, async () => {
  const options = undeclared({ protocols: ["foo"] });
  const reference = await offer((url) => new WsClient(url, options));
  const actual = await offer((url) => new WebSocket(url, options));
  expect(reference).toBe("foo");
  expect(actual).toBe("foo");
});

/// `new WebSocket(address, null)` reaches the parser as `[null]`, which `ws` refuses with
/// its one subprotocol `SyntaxError`. `null` is not `undefined`, so it must not fall
/// through to the options record; `null as never` is the same runtime shape a JavaScript
/// caller sends.
test("a null subprotocol argument is refused like ws", () => {
  const reference = refusal(() => new WsClient("ws://127.0.0.1:1/", null as never));
  const actual = refusal(() => new WebSocket("ws://127.0.0.1:1/", null as never));
  expect(reference.name).toBe("SyntaxError");
  expect(actual.name).toBe(reference.name);
  expect(actual.message).toBe(reference.message);
});
