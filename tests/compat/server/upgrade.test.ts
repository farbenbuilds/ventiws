// The server upgrade path: the 101 itself, protocol selection, path filtering, and
// the requests `ws` refuses before a socket exists.

import { expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "../../../src/index";
import { ACCEPT, rawUpgrade, request, serve, UPGRADE_HEADERS } from "./upgrade-support";

test("a valid handshake upgrades and emits connection", async () => {
  const harness = await serve(new WebSocketServer({ noServer: true }));

  try {
    const connection = new Promise<WebSocket>((resolve) => {
      harness.server.once("connection", (socket) => resolve(socket));
    });

    const result = await rawUpgrade(harness.port, request("/", UPGRADE_HEADERS));
    expect(result.status).toBe(101);
    expect(result.response).toContain("HTTP/1.1 101 Switching Protocols");
    expect(result.response).toContain(`Sec-WebSocket-Accept: ${ACCEPT}`);
    const socket = await connection;
    expect(socket).toBeInstanceOf(WebSocket);
    expect(socket.readyState).toBe(socket.OPEN);
  } finally {
    await harness.close();
  }
});

test("handleProtocols selects the response subprotocol and the socket sees it", async () => {
  const server = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => (protocols.has("superchat") ? "superchat" : false),
  });

  const harness = await serve(server);

  try {
    const connection = new Promise<WebSocket>((resolve) => {
      harness.server.once("connection", (socket) => resolve(socket));
    });

    const headers = { ...UPGRADE_HEADERS, "Sec-WebSocket-Protocol": "chat, superchat" };
    const result = await rawUpgrade(harness.port, request("/", headers));
    expect(result.status).toBe(101);
    expect(result.response).toContain("Sec-WebSocket-Protocol: superchat");
    expect((await connection).protocol).toBe("superchat");
  } finally {
    await harness.close();
  }
});

test("a non-token handleProtocols result is refused, not echoed", async () => {
  const server = new WebSocketServer({
    noServer: true,
    handleProtocols: () => "chat\r\nX-Injected: 1",
  });

  const harness = await serve(server);

  try {
    const headers = { ...UPGRADE_HEADERS, "Sec-WebSocket-Protocol": "chat" };
    const result = await rawUpgrade(harness.port, request("/", headers));
    expect(result.status).toBe(101);
    expect(result.response).not.toContain("X-Injected");
    expect(result.response).not.toContain("Sec-WebSocket-Protocol");
  } finally {
    await harness.close();
  }
});

test("the path option filters requests including their query", async () => {
  const harness = await serve(new WebSocketServer({ noServer: true, path: "/ws" }));

  try {
    expect((await rawUpgrade(harness.port, request("/other", UPGRADE_HEADERS))).status).toBe(400);
    expect((await rawUpgrade(harness.port, request("/ws?token=1", UPGRADE_HEADERS))).status).toBe(
      101,
    );
  } finally {
    await harness.close();
  }
});

test.each([
  ["POST", request("/", UPGRADE_HEADERS, "POST"), 405, "Invalid HTTP method"],
  [
    "bad key",
    request("/", { ...UPGRADE_HEADERS, "Sec-WebSocket-Key": "short" }),
    400,
    "Missing or invalid Sec-WebSocket-Key header",
  ],
  [
    "bad version",
    request("/", { ...UPGRADE_HEADERS, "Sec-WebSocket-Version": "12" }),
    400,
    "Missing or invalid Sec-WebSocket-Version header",
  ],
  [
    "bad protocol",
    request("/", { ...UPGRADE_HEADERS, "Sec-WebSocket-Protocol": "bad protocol" }),
    400,
    "Invalid Sec-WebSocket-Protocol header",
  ],
])("rejects %s", async (_name, raw, status, message) => {
  const harness = await serve(new WebSocketServer({ noServer: true }));

  try {
    const result = await rawUpgrade(harness.port, raw);
    expect(result.status).toBe(status);
    expect(result.response).toContain(message);
  } finally {
    await harness.close();
  }
});

test("verifyClient controls the handshake", async () => {
  const sync = await serve(
    new WebSocketServer({
      noServer: true,
      verifyClient: (info: { readonly origin?: string }) => info.origin === "https://allowed.test",
    }),
  );

  try {
    expect(
      (
        await rawUpgrade(
          sync.port,
          request("/", { ...UPGRADE_HEADERS, Origin: "https://other.test" }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await rawUpgrade(
          sync.port,
          request("/", { ...UPGRADE_HEADERS, Origin: "https://allowed.test" }),
        )
      ).status,
    ).toBe(101);
  } finally {
    await sync.close();
  }
});
