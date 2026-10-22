// The two failures a caller observes as `error` then `close`, and the code-less close
// frame that reports 1005. `ws` is the reference for both.

import { WebSocket as WsClient } from "ws";
import { expect, test } from "vitest";
import { WebSocket } from "../../src/index";
import { TEST_TIMEOUT_MS } from "../binding/support";
import { rawAcceptServer } from "../compat/client/raw-peer";
import { boundPort } from "./bound-port";

type Observed = {
  readonly errors: number;
  readonly closed: boolean;
  readonly stateDuringError: number;
  readonly code: number;
};

type ObservedSocket = {
  on(event: "error", listener: () => void): void;
  on(event: "close", listener: (code: number, reason: Buffer) => void): void;
  readonly readyState: number;
};

function observe(dial: () => ObservedSocket): Promise<Observed> {
  return new Promise((resolve) => {
    const errors: Error[] = [];
    let stateDuringError = -1;
    let closed = false;
    let code = 0;
    const socket = dial();
    socket.on("error", () => {
      errors.push(new Error("failed"));
      stateDuringError = socket.readyState;
    });
    socket.on("close", (closeCode: number) => {
      code = closeCode;
      closed = true;
      resolve({ errors: errors.length, closed, stateDuringError, code });
    });
  });
}

/// A port nothing is listening on, obtained by binding one and letting it go.
async function closedPort(): Promise<number> {
  const { createServer } = await import("node:net");
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = boundPort(probe);
  await new Promise<void>((resolve) => probe.close(() => resolve()));

  return port;
}

function httpRefusal(): Promise<{ url: string; close(): Promise<void> }> {
  return import("node:http").then(async ({ createServer }) => {
    const server = createServer((_request, response) => {
      response.writeHead(404).end();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    return {
      url: `ws://127.0.0.1:${boundPort(server)}/`,
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
  });
}

test.each([
  [
    "a refused dial",
    async () => ({ url: `ws://127.0.0.1:${await closedPort()}/`, close: async () => undefined }),
  ],
  ["a non-101 response", httpRefusal],
] as const)(
  "%s reports error then close in both implementations",
  { timeout: TEST_TIMEOUT_MS },
  async (_name, make) => {
    const peer = await make();

    try {
      const reference = await observe(() => new WsClient(peer.url));
      const actual = await observe(() => new WebSocket(peer.url));
      expect(actual).toEqual(reference);
      // `ws` latches CLOSING before the error, so the socket is going away, not gone.
      expect(actual).toEqual({ errors: 1, closed: true, stateDuringError: 2, code: 1006 });
    } finally {
      await peer.close();
    }
  },
);

/// RFC 6455 section 7.1.5 assigns 1005 to a close frame with an empty body.
test("a code-less close reports 1005, not 1006", { timeout: TEST_TIMEOUT_MS }, async () => {
  const peer = await rawAcceptServer();

  try {
    const socket = new WebSocket(peer.url);
    socket.on("error", () => undefined);
    await new Promise<void>((resolve) => socket.once("open", () => resolve()));

    const closed = new Promise<{ code: number; reason: Buffer }>((resolve) => {
      socket.once("close", (code: number, reason: Buffer) => resolve({ code, reason }));
    });

    const raw = await peer.accepted;
    raw.write(Buffer.from([0x88, 0x00]));
    expect(await closed).toEqual({ code: 1005, reason: Buffer.alloc(0) });
  } finally {
    await peer.close();
  }
});
