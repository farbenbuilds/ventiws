import { expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "../../../src/index";
import { ACCEPT, rawUpgrade, request, serve, UPGRADE_HEADERS } from "./upgrade-support";

test("a valid handshake upgrades and emits connection", async () => {
  const harness = await serve(new WebSocketServer({ noServer: true }));

  try {
    const connection = new Promise<WebSocket>((resolve) => {
      harness.server.once("connection", (socket) => {
        resolve(socket);
      });
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
      harness.server.once("connection", (socket) => {
        resolve(socket);
      });
    });

    const headers = { ...UPGRADE_HEADERS, "Sec-WebSocket-Protocol": "chat, superchat" };
    const result = await rawUpgrade(harness.port, request("/", headers));
    expect(result.status).toBe(101);
    expect(result.response).toContain("Sec-WebSocket-Protocol: superchat");
    const socket = await connection;
    expect(socket.protocol).toBe("superchat");
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

test("shouldHandle inspects the request path without the query", () => {
  const server = new WebSocketServer({ noServer: true, path: "/ws" });
  expect(handles(server, "/ws?a=1")).toBe(true);
  expect(handles(server, "/ws")).toBe(true);
  expect(handles(server, "/other")).toBe(false);
  server.close();
});

/// `shouldHandle` reads only `url`, so the fixture supplies that field rather than a whole
/// `IncomingMessage`.
function handles(server: WebSocketServer, url: string): boolean | Promise<boolean> {
  // SAFETY: the method's contract here is the path in `url`; the rest of the request is
  // never read.
  return server.shouldHandle({ url } as never);
}
