// The policy hooks an application can replace on the upgrade path.
//
// Split from `upgrade-policy.test.ts`, which covers the checks the server applies by
// default. These three are the seams: a `wsClientError` listener that owns the rejection,
// the header filter on a `verifyClient` answer, and a `verifyClient` assigned after the
// server exists.

import { expect, test } from "vitest";
import { WebSocketServer } from "../../../src/index";
import { rawUpgrade, request, serve, UPGRADE_HEADERS } from "./upgrade-support";

test("wsClientError replaces the written rejection", async () => {
  const harness = await serve(new WebSocketServer({ noServer: true }));

  try {
    const failures = new Promise<Error>((resolve) => {
      harness.server.once("wsClientError", (error, socket) => {
        socket.destroy();
        resolve(error);
      });
    });

    const result = await rawUpgrade(harness.port, request("/", UPGRADE_HEADERS, "POST"));
    expect(result.status).toBe(0);
    expect(result.response).toBe("");
    const error = await failures;
    expect(error).toHaveProperty("code", "ERR_PROTOCOL");
    expect(error.message).toBe("Invalid HTTP method");
  } finally {
    await harness.close();
  }
});

test("verifyClient headers with control characters are dropped", async () => {
  const async = await serve(
    new WebSocketServer({
      noServer: true,
      verifyClient: (_info, callback) => {
        callback(false, 403, "Nope", { "X-Bad": "a\r\nX-Injected: 1", "X-Good": "ok" });
      },
    }),
  );

  try {
    const result = await rawUpgrade(async.port, request("/", UPGRADE_HEADERS));
    expect(result.status).toBe(403);
    expect(result.response).toContain("X-Good: ok");
    expect(result.response).not.toContain("X-Injected");
  } finally {
    await async.close();
  }
});

test("a verifyClient assigned after construction takes effect", async () => {
  const server = new WebSocketServer({ noServer: true });
  server.options.verifyClient = () => false;
  const harness = await serve(server);

  try {
    const result = await rawUpgrade(harness.port, request("/", UPGRADE_HEADERS));
    expect(result.status).toBe(401);
  } finally {
    await harness.close();
  }
});
