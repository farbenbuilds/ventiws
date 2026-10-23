// What a redirect may carry to another origin, and the downgrade `ws` follows but ventiws refuses.
import { WebSocket as WsSocket } from "ws";
import { expect, test } from "vitest";
import { WebSocket } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { downgradePeer } from "./downgrade-peer";
import { handshakePeer, redirectingPeer, selfRedirectPeer } from "./redirect-presets";
import { certificates } from "./tls-support";
import { undeclared } from "./undeclared";

function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}

test(
  "credentials do not survive a redirect to another host",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const final = await handshakePeer();
    const first = await redirectingPeer(final.url);
    const port = new URL(first.url).port;

    const socket = new WebSocket(
      `ws://user:pass@127.0.0.1:${port}`,
      undefined,
      undeclared({ followRedirects: true }),
    );

    try {
      await opened(socket);
      expect(first.authorizations[0]).toBe("Basic dXNlcjpwYXNz");
      expect(final.authorizations[0]).toBeUndefined();
    } finally {
      socket.terminate();
      await first.close();
      await final.close();
    }
  },
);

test("credentials survive a redirect to the same host", { timeout: TEST_TIMEOUT_MS }, async () => {
  const peer = await selfRedirectPeer("/same-host-path");
  const port = new URL(peer.url).port;

  const socket = new WebSocket(
    `ws://user:pass@127.0.0.1:${port}`,
    undefined,
    undeclared({ followRedirects: true }),
  );

  try {
    await opened(socket);
    expect(peer.authorizations).toEqual(["Basic dXNlcjpwYXNz", "Basic dXNlcjpwYXNz"]);
  } finally {
    socket.terminate();
    await peer.close();
  }
});

test("caller headers do not survive another authority", { timeout: TEST_TIMEOUT_MS }, async () => {
  const final = await handshakePeer();
  const first = await redirectingPeer(final.url);

  const socket = new WebSocket(
    first.url,
    undefined,
    undeclared({
      followRedirects: true,
      headers: { authorization: "Bearer first-hop", cookie: "session=1" },
    }),
  );

  try {
    await opened(socket);
    expect(first.authorizations[0]).toBe("Bearer first-hop");
    expect(first.cookies[0]).toBe("session=1");
    expect(final.authorizations[0]).toBeUndefined();
    expect(final.cookies[0]).toBeUndefined();
  } finally {
    socket.terminate();
    await first.close();
    await final.close();
  }
});

type Make = (url: string) => WsSocket;

const wsLeg: Make = (url) =>
  new WsSocket(url, undefined, { followRedirects: true, ca: certificates().ca });

const ventiwsLeg: Make = (url) =>
  new WebSocket(url, undefined, undeclared({ followRedirects: true, ca: certificates().ca }));

async function hop(make: Make) {
  const destination = await handshakePeer();
  const peer = await downgradePeer(destination.url);
  const socket = make(peer.url);
  const hops: string[] = [];

  const outcome = await new Promise<string>((resolve) => {
    socket.on("redirect", (target) => hops.push(String(target)));
    socket.on("open", () => resolve("open"));
    socket.on("error", (error) => resolve(error.message));
  });

  const seen = { outcome, url: socket.url, hops, requests: destination.paths.length };

  socket.on("error", () => undefined);
  socket.terminate();
  await peer.close();
  await destination.close();

  return seen;
}

test(
  "ws follows a wss: to ws: redirect and ventiws refuses it",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const reference = await hop(wsLeg);
    const ours = await hop(ventiwsLeg);

    expect(reference.outcome).toBe("open");
    expect(reference.hops).toHaveLength(1);
    expect(reference.hops[0]).toMatch(/^ws:\/\//);
    expect(reference.url).toMatch(/^ws:\/\//);
    expect(reference.requests).toBe(1);

    expect(ours.outcome).toBe("Cannot follow a redirect from wss: to ws:");
    expect(ours.hops).toEqual([]);
    expect(ours.requests).toBe(0);
    expect(ours.url).toMatch(/^wss:\/\//);
  },
);
