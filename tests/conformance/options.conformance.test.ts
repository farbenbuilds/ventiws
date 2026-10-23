import { WebSocket, WebSocketServer } from "ws";
import { expect, test } from "vitest";
import { normalizeProtocols } from "../../src/compat/options/shared";
import { normalizeServerOptions } from "../../src/compat/options/server";

type Outcome =
  | { readonly threw: false }
  | { readonly threw: true; readonly name: string; readonly message: string };

/// The listen-target rows, including the ambiguous and out-of-type values the
/// constructor must refuse rather than accept.
type ServerOptionRow = {
  readonly port?: number;
  readonly noServer?: boolean;
  readonly server?: number;
};

/// The subprotocol slot accepts a list, a scalar, and the out-of-type values a
/// JavaScript caller can still send.
type ProtocolValue = string | string[] | null | number;

function outcome(run: () => void): Outcome {
  try {
    run();

    return { threw: false };
  } catch (error) {
    return {
      threw: true,
      name: error instanceof Error ? error.constructor.name : "Thrown",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function wsServerOutcome(options: ServerOptionRow): Outcome {
  return outcome(() => {
    // SAFETY: The table feeds out-of-type listen targets on purpose; `ws` validates
    // them at runtime, and the comparison is that validation error.
    const server = new WebSocketServer(options as never);
    server.close();
  });
}

function ourServerOutcome(options: ServerOptionRow): Outcome {
  return outcome(() => {
    // SAFETY: The same rows as `ws`; the normalizer must refuse exactly what the
    // constructor refuses, so the fixture passes them through the same seam.
    normalizeServerOptions(options as never);
  });
}

test.each<ServerOptionRow>([
  {},
  { port: 0 },
  { noServer: true },
  { port: 0, noServer: true },
  { server: 0 },
  { server: 0, port: 0 },
  { server: 0, noServer: true },
])("listen target parity for %j", (options) => {
  expect(ourServerOutcome(options)).toEqual(wsServerOutcome(options));
});

function wsProtocolOutcome(protocols: ProtocolValue): Outcome {
  return outcome(() => {
    // SAFETY: `5` and `null` are the out-of-type values the table exists to compare;
    // both implementations must refuse them at construction.
    const socket = new WebSocket("ws://127.0.0.1:1", protocols as never);
    socket.on("error", () => {});
    socket.terminate();
  });
}

function ourProtocolOutcome(protocols: ProtocolValue): Outcome {
  return outcome(() => {
    // SAFETY: The same out-of-type values, passed through the shared
    // normalizer the constructor uses so the refusal is the same one.
    normalizeProtocols(protocols as never);
  });
}

// A non-null object is the options argument to ws, so the client factory owns
// that case; this table covers the values the typed protocols surface accepts.
test.each(["chat", ["chat", "superchat"], "bad protocol", ["chat", "chat"], 5, null])(
  "subprotocol parity for %j",
  (protocols) => {
    expect(ourProtocolOutcome(protocols)).toEqual(wsProtocolOutcome(protocols));
  },
);
