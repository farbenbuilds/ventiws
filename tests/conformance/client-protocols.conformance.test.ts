// The client subprotocol list, compared against `ws` 8.22.0. The new `protocols` option
// is the only way to state protocols through the options record, the constructor argument
// must win over it, and an invalid argument must still be refused. Nothing here needs a
// server: a peer that reads the request head and hangs up is the whole observation.

import { createServer } from "node:net";
import { WebSocket as WsClient } from "ws";
import { expect, test } from "vitest";
import { WebSocket } from "../../src/index";
import type { ClientOptions } from "../../src/index";
import { TEST_TIMEOUT_MS } from "../binding/support";
import { boundPort } from "./bound-port";

type ClientLike = {
  terminate(): void;
  on(event: "error", listener: (error: Error) => void): void;
};

/// The two constructors' independent answers, reduced to what a comparison reads.
type Refusal = {
  readonly name: string;
  readonly message: string;
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
      const port = boundPort(listener);
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
function refusal(build: () => ClientLike): Refusal {
  try {
    const socket = build();
    socket.on("error", () => undefined);

    return { name: "none", message: "no throw" };
  } catch (error) {
    return {
      name: error instanceof Error ? error.constructor.name : "Thrown",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/// The options record the table sends; `protocols` is the field `ws` 8.22.0 reads.
type ProtocolOptions = ClientOptions & {
  readonly protocols: string | string[];
};

function protocolOptions(protocols: string | string[]): ClientOptions {
  const options: ProtocolOptions = { protocols };

  return options;
}

/// Each row: the name, the constructor's subprotocol argument, the options record, and
/// the header both implementations must produce. `ws` wraps a scalar and lets the
/// constructor argument override the option (`websocket.js:75`).
type ProtocolCase = readonly [
  name: string,
  protocols: string | string[] | undefined,
  options: ProtocolOptions,
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
    const reference = await offer((url) => new WsClient(url, protocols, options));
    const actual = await offer((url) => new WebSocket(url, protocols, options));
    expect(reference).toBe(header);
    expect(actual).toBe(header);
  },
);

/// The two-argument overload: an options record in the subprotocol slot is promoted by
/// `ws`, and its `protocols` field is the list that goes on the wire.
test("the promoted options record carries protocols", { timeout: TEST_TIMEOUT_MS }, async () => {
  const options = protocolOptions(["foo"]);
  const reference = await offer((url) => new WsClient(url, options));
  const actual = await offer((url) => new WebSocket(url, options));
  expect(reference).toBe("foo");
  expect(actual).toBe("foo");
});

/// `new WebSocket(address, null)` reaches the parser as `[null]`, which `ws` refuses with
/// its one subprotocol `SyntaxError`. `null` is not `undefined`, so it must not fall
/// through to the options record.
test("a null subprotocol argument is refused like ws", () => {
  // SAFETY: The table exists to compare the runtime value `null`, which the overload
  // types exclude, through the same seam both constructors' JavaScript callers use.
  const nullProtocols = null as never;
  const reference = refusal(() => new WsClient("ws://127.0.0.1:1/", nullProtocols));
  const actual = refusal(() => new WebSocket("ws://127.0.0.1:1/", nullProtocols));
  expect(reference.name).toBe("SyntaxError");
  expect(actual.name).toBe(reference.name);
  expect(actual.message).toBe(reference.message);
});
