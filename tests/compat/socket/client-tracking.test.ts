// `clientTracking`, which decides whether `server.clients` exists at all. Its own file because
// it is the one option whose *absence* is the observable: `ws` leaves the key off the server
// entirely rather than setting it to `undefined`.

import { expect, test } from "vitest";
import { WebSocketServer, type ServerOptions } from "../../../src/index";
import { normalizeServerOptions } from "../../../src/compat/options/server";

/// The `clientTracking` fixtures, including the out-of-type falsy values `ws` reads as off.
type TrackingFixture = {
  readonly noServer: true;
  readonly clientTracking: boolean | number | string | null | undefined;
};

type TrackingValue = TrackingFixture["clientTracking"];

function atRuntime(options: TrackingFixture): ServerOptions {
  // SAFETY: `ws` reads `clientTracking` by truthiness, so a number, string, or null is a
  // deliberate fixture even though `@types/ws` declares a boolean.
  return options as never;
}

test("a falsy clientTracking leaves clients absent, as ws does", () => {
  const server = new WebSocketServer(atRuntime({ noServer: true, clientTracking: 0 }));

  try {
    // Absent rather than present-and-undefined, so `in`, `Object.keys`, and `JSON.stringify` agree with `ws`.
    expect("clients" in server).toBe(false);
  } finally {
    server.close();
  }
});

/// `null`, `0`, and `""` were read as absent, which put a `clients` set on the server where `ws` has
/// none and made `close()` wait for connections where `ws` emits on the next tick.
test("clientTracking is a truthiness, not an identity", () => {
  const truthy: readonly TrackingValue[] = [undefined, true, 1, "yes"];

  for (const value of truthy) {
    expect(
      normalizeServerOptions(atRuntime({ noServer: true, clientTracking: value })).clientTracking,
    ).toBe(true);
  }

  const falsy: readonly TrackingValue[] = [false, null, 0, ""];

  for (const value of falsy) {
    expect(
      normalizeServerOptions(atRuntime({ noServer: true, clientTracking: value })).clientTracking,
    ).toBe(false);
  }
});
