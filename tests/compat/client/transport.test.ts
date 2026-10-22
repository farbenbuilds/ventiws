// The client's other transports: a `wss:` server with caller-supplied TLS options
// and a `ws+unix:` address. Both are part of the address contract `ws` exposes.

import { createServer, type Server } from "node:http";
import { expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "../../../src/index";
import type { ClientOptions } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { boundPort } from "../address-support";
import { certificates, tlsServer } from "./tls-support";
import { undeclared } from "./undeclared";

/// The echoed message on an opened connection, or the start of the refusal.
async function echoThrough(url: string, options: ClientOptions): Promise<string> {
  return new Promise((resolve) => {
    const socket = new WebSocket(url, undeclared(options));
    socket.once("open", () => socket.send("hi"));
    socket.once("message", (data) => {
      socket.terminate();
      resolve(data.toString());
    });
    socket.once("error", (error: Error) => resolve(`error: ${error.message.slice(0, 40)}`));
  });
}

test(
  "rejectUnauthorized: false reaches the TLS session",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const server = await tlsServer();

    try {
      expect(await echoThrough(server.url, { rejectUnauthorized: false })).toBe("hi");
    } finally {
      await server.close();
    }
  },
);

test("a ca the caller supplied is trusted", { timeout: TEST_TIMEOUT_MS }, async () => {
  const server = await tlsServer();

  try {
    expect(await echoThrough(server.url, { ca: certificates().ca })).toBe("hi");
  } finally {
    await server.close();
  }
});

test(
  "an untrusted certificate is still refused by default",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const server = await tlsServer();

    try {
      expect(await echoThrough(server.url, {})).toMatch(/^error: self-signed certificate/);
    } finally {
      await server.close();
    }
  },
);

/// A `WebSocketServer` behind a real HTTP server over one UNIX domain socket.
async function ipcServer(): Promise<{
  readonly socketPath: string;
  close(): Promise<void>;
}> {
  const socketPath = `/tmp/ventiws-ipc-${process.pid}-${Date.now()}.sock`;
  const http: Server = createServer();
  const server = new WebSocketServer({ server: http });
  server.on("connection", (socket) => {
    socket.on("message", (data) => socket.send(`echo:${data.toString()}`));
  });
  await new Promise<void>((resolve) => http.listen(socketPath, resolve));

  return {
    socketPath,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

test("a ws+unix address dials the socket and echoes", { timeout: TEST_TIMEOUT_MS }, async () => {
  const harness = await ipcServer();
  const socket = new WebSocket(`ws+unix:${harness.socketPath}:/chat`);
  socket.on("error", () => undefined);

  try {
    await new Promise<void>((resolve) => socket.once("open", () => resolve()));

    const echoed = new Promise<string>((resolve) => {
      socket.once("message", (data) => resolve(data.toString()));
    });

    socket.send("hello");
    expect(await echoed).toBe("echo:hello");
  } finally {
    socket.terminate();
    await harness.close();
  }
});

test("a ws+unix address with no path requests the root", { timeout: TEST_TIMEOUT_MS }, async () => {
  const harness = await ipcServer();
  const socket = new WebSocket(`ws+unix:${harness.socketPath}`);
  socket.on("error", () => undefined);

  try {
    await new Promise<void>((resolve) => socket.once("open", () => resolve()));
    // An IPC address has no host for a scheme rewrite, so `url` is as written.
    expect(socket.url).toBe(`ws+unix:${harness.socketPath}`);
  } finally {
    socket.terminate();
    await harness.close();
  }
});

test("an empty ws+unix pathname is refused", () => {
  expect(() => new WebSocket("ws+unix:")).toThrowError(/pathname is empty/);
});

test("a TCP address is unaffected", { timeout: TEST_TIMEOUT_MS }, async () => {
  const server = new WebSocketServer({ port: 0 });
  const accepted = new Promise<void>((resolve) => server.once("connection", () => resolve()));
  const port = boundPort(server.address());
  const socket = new WebSocket(`ws://127.0.0.1:${port}/chat`);
  socket.on("error", () => undefined);

  try {
    await new Promise<void>((resolve) => socket.once("open", () => resolve()));
    await accepted;
    expect(socket.url).toBe(`ws://127.0.0.1:${port}/chat`);
  } finally {
    socket.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
