import { get } from "node:http";
import { WebSocket as WsClient } from "ws";
import { expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "../../../src/index";
import { boundPort } from "../address-support";

function statusOf(port: number, path = "/"): Promise<number> {
  return new Promise((resolve, reject) => {
    get({ host: "127.0.0.1", port, path }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    }).on("error", reject);
  });
}

function listening(server: WebSocketServer): Promise<void> {
  return new Promise((resolve) => server.once("listening", () => resolve()));
}

function closed(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => socket.once("close", () => resolve()));
}

function accepted(server: WebSocketServer): Promise<WebSocket> {
  return new Promise((resolve) => server.once("connection", (socket) => resolve(socket)));
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
  server.on("close", () => {
    closes.push(Date.now());
  });
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  expect(closes).toHaveLength(1);

  const error = await new Promise<Error | undefined>((resolve) => {
    server.close((failure) => {
      resolve(failure);
    });
  });

  expect(error?.message).toBe("The server is not running");
  expect(closes).toHaveLength(2);
});

test("port mode answers 426 and accepts upgraded clients", async () => {
  const server = new WebSocketServer({ port: 0 });
  await listening(server);
  const port = boundPort(server.address());
  expect(port).toBeGreaterThan(0);
  expect(await statusOf(port)).toBe(426);

  const connection = new Promise<{ socket: WebSocket; request: unknown }>((resolve) => {
    server.once("connection", (socket, request) => {
      resolve({ socket, request });
    });
  });

  const client = new WsClient(`ws://127.0.0.1:${port}/`);
  await new Promise<void>((resolve, reject) => {
    client.once("open", () => {
      resolve();
    });
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
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
});

test("server mode adopts a caller-owned HTTP server", async () => {
  const { createServer } = await import("node:http");
  const httpServer = createServer();
  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });
  const port = boundPort(httpServer.address());
  const server = new WebSocketServer({ server: httpServer });
  const connection = accepted(server);
  const client = new WsClient(`ws://127.0.0.1:${port}/`);
  await new Promise<void>((resolve, reject) => {
    client.once("open", () => {
      resolve();
    });
    client.once("error", reject);
  });
  const socket = await connection;
  expect(socket).toBeInstanceOf(WebSocket);

  client.terminate();
  await closed(socket);
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  httpServer.close();
});
