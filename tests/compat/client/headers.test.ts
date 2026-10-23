// What the client puts on the wire: header precedence, the `finishRequest` hook, the
// mask key, and the subprotocol it agreed to.

import { createServer } from "node:net";
import { expect, test } from "vitest";
import { WebSocket, type ClientOptions } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { boundPort } from "../address-support";
import { open, openWithPeer } from "./client-support";
import { rawAcceptServer } from "./raw-peer";
import { undeclared } from "./undeclared";

/// The request head, as a lower-cased record.
async function requestHead(
  options: ClientOptions,
  host = "127.0.0.1",
): Promise<Record<string, string>> {
  const head = await new Promise<string>((resolve) => {
    const listener = createServer((socket) => {
      socket.once("data", (data) => {
        socket.destroy();
        listener.close();
        resolve(data.toString("latin1"));
      });
    });

    listener.listen(0, "127.0.0.1", () => {
      const port = boundPort(listener.address());
      const socket = new WebSocket(`ws://${host}:${port}/`, undeclared(options));
      socket.once("error", () => {
        socket.terminate();
        listener.close();
      });
    });
  });

  const record: Record<string, string> = {};

  for (const line of head.split("\r\n")) {
    const at = line.indexOf(":");

    if (at > 0) record[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
  }

  return record;
}

test(
  "the library's upgrade headers win over a caller's",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const head = await requestHead({ headers: { connection: "keep-alive", upgrade: "h2c" } });
    expect(head.connection).toBe("Upgrade");
    expect(head.upgrade).toBe("websocket");
  },
);

test("a caller's own header still reaches the request", { timeout: TEST_TIMEOUT_MS }, async () => {
  expect((await requestHead({ headers: { "X-Trace": "abc" } }))["x-trace"]).toBe("abc");
});

test(
  "a caller's Authorization beats credentials in the URL",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const head = await requestHead(
      { headers: { Authorization: "Bearer tok" } },
      "user:pass@127.0.0.1",
    );

    expect(head.authorization).toBe("Bearer tok");
  },
);

test(
  "URL credentials fill Authorization when the caller set none",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const head = await requestHead({}, "user:pass@127.0.0.1");
    expect(head.authorization).toBe(`Basic ${Buffer.from("user:pass").toString("base64")}`);
  },
);

test("an empty origin sends no Origin header", { timeout: TEST_TIMEOUT_MS }, async () => {
  expect((await requestHead({ origin: "" })).origin).toBeUndefined();
});

test(
  "origin is Origin at version 13 and Sec-WebSocket-Origin below it",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const thirteen = await requestHead({ origin: "https://example.test" });
    expect(thirteen.origin).toBe("https://example.test");
    expect(thirteen["sec-websocket-origin"]).toBeUndefined();
    const eight = await requestHead({ origin: "https://example.test", protocolVersion: 8 });
    expect(eight["sec-websocket-origin"]).toBe("https://example.test");
    expect(eight.origin).toBeUndefined();
  },
);

test("finishRequest runs before the request goes out", { timeout: TEST_TIMEOUT_MS }, async () => {
  const states: number[] = [];

  const { socket, harness } = await openWithPeer(() => undefined, undefined, undefined, {
    finishRequest: (req, websocket) => {
      states.push(websocket.readyState);
      req.end();
    },
  });

  try {
    // `ws` hands the callback the socket while it is still CONNECTING.
    expect(states).toEqual([WebSocket.CONNECTING]);
    expect(socket.readyState).toBe(WebSocket.OPEN);
  } finally {
    socket.terminate();
    await harness.close();
  }
});

test(
  "a negotiated subprotocol is reported on the client",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { socket, harness } = await openWithPeer(() => undefined, undefined, ["chat"]);

    try {
      expect(socket.protocol).toBe("chat");
    } finally {
      socket.terminate();
      await harness.close();
    }
  },
);

test("a server that picks no subprotocol is refused", { timeout: TEST_TIMEOUT_MS }, async () => {
  const peer = await rawAcceptServer();

  try {
    await expect(open(peer.url, undefined, ["chat"])).rejects.toThrow(/no subprotocol/);
  } finally {
    await peer.close();
  }
});
