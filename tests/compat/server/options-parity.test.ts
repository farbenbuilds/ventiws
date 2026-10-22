import { WebSocketServer as WsServer } from "ws";
import { expect, test } from "vitest";
import { WebSocketServer } from "../../../src/index";
import { optionValues } from "../server-options";

/// The `ws`-shaped server record is built from options before any connection
/// exists, so these are pure property comparisons: every one of them was
/// asserted against a running suite when it was wrong, and none of them needs a
/// socket to be observable.

type EitherServer = WsServer | WebSocketServer;

function present(server: EitherServer, key: string): boolean {
  return key in server;
}

/// The tracked client count, or undefined when `clientTracking` left the key off entirely.
function clientCount(server: EitherServer): number | undefined {
  if (!("clients" in server)) return undefined;

  return server.clients.size;
}

test.each([true, false])(
  "the clients property is present exactly as ws has it (%s)",
  (tracking) => {
    // `ws` assigns `clients` only when `clientTracking` is truthy, so with tracking
    // off the key does not exist at all. Present-and-undefined is a third thing
    // that matches neither: it survives `Object.keys`, a spread, and
    // `JSON.stringify`, all of which `ws` would drop.
    const reference = new WsServer({ clientTracking: tracking, noServer: true });
    const ours = new WebSocketServer({ clientTracking: tracking, noServer: true });
    expect(present(ours, "clients")).toBe(present(reference, "clients"));
    expect(clientCount(ours)).toBe(clientCount(reference));
  },
);

test("clientTracking true adds an empty set in both", () => {
  const reference = new WsServer({ noServer: true });
  expect(clientCount(reference)).toBe(0);

  const ours = new WebSocketServer({ noServer: true });
  expect(clientCount(ours)).toBe(0);
});

/// `path` is declared by `@types/ws` but `ws`'s runtime never sets it, so
/// `"path" in server` is false there. ventiws exposes it, which is a superset:
/// reading it is harmless, but the divergence is recorded so nobody writes a
/// test that assumes the two agree on its presence.
test("ws does not expose path at runtime", () => {
  const reference = new WsServer({ noServer: true, path: "/ws" });
  expect(present(reference, "path")).toBe(false);

  const ours = new WebSocketServer({ noServer: true, path: "/ws" });
  expect(present(ours, "path")).toBe(true);
  expect(ours.path).toBe("/ws");
});

/// `ws` rewrites the `perMessageDeflate: true` shorthand to an options object on
/// the public record, so a caller that inspects `server.options` sees an object
/// rather than the boolean it passed.
test("perMessageDeflate true is rewritten to an object", () => {
  const reference = new WsServer({ noServer: true, perMessageDeflate: true });
  expect(optionValues(reference.options).get("perMessageDeflate")).toEqual(expect.any(Object));

  const ours = new WebSocketServer({ noServer: true, perMessageDeflate: true });
  expect(optionValues(ours.options).get("perMessageDeflate")).toEqual(expect.any(Object));
});

/// The sender limits `@types/ws` declares and the reference does not list. They
/// are observable on `server.options`, so omitting them made a defaulted record a
/// strict subset of the contract.
test.each([
  ["maxBufferedChunks", 262144],
  ["maxFragments", 16384],
  ["closeTimeout", 30000],
  ["maxPayload", 100 * 1024 * 1024],
  ["allowSynchronousEvents", true],
  ["autoPong", true],
  ["skipUTF8Validation", false],
])("server.options defaults %s to the ws value", (key, expected) => {
  const reference = new WsServer({ noServer: true });
  const ours = new WebSocketServer({ noServer: true });
  expect(optionValues(ours.options).get(key)).toBe(expected);
  expect(optionValues(ours.options).get(key)).toBe(optionValues(reference.options).get(key));
});

test("an explicit option is never overwritten by the defaults", () => {
  const ours = new WebSocketServer({ noServer: true, maxPayload: 1024, autoPong: false });
  expect(optionValues(ours.options).get("maxPayload")).toBe(1024);
  expect(optionValues(ours.options).get("autoPong")).toBe(false);
});
