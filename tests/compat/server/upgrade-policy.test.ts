import { expect, test } from "vitest";
import { WebSocketServer } from "../../../src/index";
import { rawUpgrade, request, serve, UPGRADE_HEADERS } from "./upgrade-support";

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

test("verifyClient sync and async control the handshake", async () => {
  const sync = await serve(
    new WebSocketServer({
      noServer: true,
      verifyClient: (info: { readonly origin?: string }) => info.origin === "https://allowed.test",
    }),
  );

  try {
    const denied = await rawUpgrade(
      sync.port,
      request("/", { ...UPGRADE_HEADERS, Origin: "https://other.test" }),
    );

    expect(denied.status).toBe(401);

    const allowed = await rawUpgrade(
      sync.port,
      request("/", { ...UPGRADE_HEADERS, Origin: "https://allowed.test" }),
    );

    expect(allowed.status).toBe(101);
  } finally {
    await sync.close();
  }

  const async = await serve(
    new WebSocketServer({
      noServer: true,
      verifyClient: (_info, callback) => {
        callback(false, 403, "Nope", { "X-Reason": "denied" });
      },
    }),
  );

  try {
    const result = await rawUpgrade(async.port, request("/", UPGRADE_HEADERS));
    expect(result.status).toBe(403);
    expect(result.response).toContain("X-Reason: denied");
    expect(result.response).toContain("Nope");
  } finally {
    await async.close();
  }
});

test("verifyClient sees the raw origin header, undefined when absent", async () => {
  const seen: unknown[] = [];

  const server = new WebSocketServer({
    noServer: true,
    verifyClient: (info: { readonly origin?: string }) => {
      seen.push(info.origin);

      return false;
    },
  });

  const harness = await serve(server);

  try {
    const result = await rawUpgrade(harness.port, request("/", UPGRADE_HEADERS));
    expect(result.status).toBe(401);
    expect(seen).toEqual([undefined]);
  } finally {
    await harness.close();
  }
});
