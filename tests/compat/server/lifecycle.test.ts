// Server lifecycle: construction, listen modes, close exactly once, and the
// `clients` set whose presence is itself an option.

import { createServer } from "node:http";
import { get } from "node:http";
import { WebSocket as WsClient } from "ws";
import { expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { boundPort } from "../address-support";

function statusOf(port: number, path = "/"): Promise<number> {
  return new Promise((resolve, reject) => {
    get({ host: "127.0.0.1", port, path }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    }).on("error", reject);
  });
}

function closed(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => socket.once("close", () => resolve()));
}

test("the constructor validates the listen target and passes instanceof", () => {
  expect(() => new WebSocketServer()).toThrow(/One and only one/);
  expect(() => new WebSocketServer({ port: 0, noServer: true })).toThrow(TypeError);
  const server = new WebSocketServer({ noServer: true });
  expect(server).toBeInstanceOf(WebSocketServer);
  expect(server.options.clientTracking).toBe(true);
  expect(server.options.maxPayload).toBe(100 * 1024 * 1024);
  expect(server.options.perMessageDeflate).toBe(false);
  expect(server.options.path).toBeNull();
  expect(server.path).toBe("");
  expect(server.clients.size).toBe(0);
  server.close();
});

test("address is refused in noServer mode", () => {
  const server = new WebSocketServer({ noServer: true });
  expect(() => server.address()).toThrow(/noServer/);
  server.close();
});

test("close emits once, calls back, and reports a stopped server", async () => {
  const server = new WebSocketServer({ noServer: true });
  const closes: number[] = [];
  server.on("close", () => closes.push(Date.now()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  expect(closes).toHaveLength(1);

  const error = await new Promise<Error | undefined>((resolve) => {
    server.close((failure) => resolve(failure));
  });

  expect(error?.message).toBe("The server is not running");
  expect(closes).toHaveLength(2);
});

test(
  "port mode answers 426 and accepts upgraded clients",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const port = boundPort(server.address());
    expect(port).toBeGreaterThan(0);
    expect(await statusOf(port)).toBe(426);

    const connection = new Promise<{ socket: WebSocket; request: unknown }>((resolve) => {
      server.once("connection", (socket, request) => resolve({ socket, request }));
    });

    const client = new WsClient(`ws://127.0.0.1:${port}/`);
    await new Promise<void>((resolve, reject) => {
      client.once("open", resolve);
      client.once("error", reject);
    });
    const { socket, request } = await connection;
    expect(socket).toBeInstanceOf(WebSocket);
    expect(socket.readyState).toBe(socket.OPEN);
    expect(request).toBeDefined();
    expect(server.clients.has(socket)).toBe(true);

    const done = closed(socket);
    socket.terminate();
    await done;
    expect(server.clients.size).toBe(0);

    client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  },
);

test("server mode adopts a caller-owned HTTP server", { timeout: TEST_TIMEOUT_MS }, async () => {
  const httpServer = createServer();
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const port = boundPort(httpServer.address());
  const server = new WebSocketServer({ server: httpServer });

  const connection = new Promise<WebSocket>((resolve) =>
    server.once("connection", (socket) => resolve(socket)),
  );

  const client = new WsClient(`ws://127.0.0.1:${port}/`);
  await new Promise<void>((resolve, reject) => {
    client.once("open", resolve);
    client.once("error", reject);
  });
  const socket = await connection;
  expect(socket).toBeInstanceOf(WebSocket);
  client.terminate();
  await closed(socket);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  httpServer.close();
});

/// `ws` assigns `clients` only when `clientTracking` is truthy, so falsy leaves the
/// key off entirely rather than present-and-undefined.
test("clientTracking is a truthiness and its absence removes clients", () => {
  // SAFETY: `ws` reads clientTracking by truthiness; zero is the deliberate falsy fixture.
  const off = new WebSocketServer({ noServer: true, clientTracking: 0 as never });

  try {
    expect("clients" in off).toBe(false);
  } finally {
    off.close();
  }

  // SAFETY: a truthy non-boolean is the runtime form `ws` accepts.
  const on = new WebSocketServer({ noServer: true, clientTracking: "yes" as never });

  try {
    expect(on.clients.size).toBe(0);
  } finally {
    on.close();
  }
});
