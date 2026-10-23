// Redirect chains: following, refusing, an unparseable Location, and the hop limit.
// `ws` is the reference for every count and every outcome.

import { WebSocket as WsSocket } from "ws";
import { expect, test } from "vitest";
import { WebSocket } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { closed, failed } from "./client-settlement";
import { handshakePeer, redirectingPeer } from "./redirect-presets";
import { scriptedPeer } from "./redirect-peer";
import { undeclared } from "./undeclared";

function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}

test(
  "followRedirects carries the connection to the new location",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const final = await handshakePeer();
    const first = await redirectingPeer(final.url);
    const socket = new WebSocket(first.url, undefined, undeclared({ followRedirects: true }));

    try {
      await opened(socket);
      expect(socket.url.startsWith(final.url)).toBe(true);
      expect(socket.url).not.toBe(first.url);
    } finally {
      socket.terminate();
      await first.close();
      await final.close();
    }
  },
);

test(
  "without followRedirects a 3xx is refused and close fires",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const elsewhere = await handshakePeer();
    const peer = await redirectingPeer(elsewhere.url);
    const socket = new WebSocket(peer.url);

    try {
      const seen: string[] = [];
      socket.on("redirect", (url) => seen.push(url));
      const error = await failed(socket);
      expect(seen).toEqual([]);
      expect(error.message).toContain("302");
      await closed(socket);
    } finally {
      await peer.close();
      await elsewhere.close();
    }
  },
);

test(
  "a redirect that is not a URL is refused rather than dialled",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const peer = await redirectingPeer("ws://");
    const socket = new WebSocket(peer.url, undefined, undeclared({ followRedirects: true }));

    try {
      const error = await failed(socket);
      expect(error.message.length).toBeGreaterThan(0);
      expect(socket.readyState).toBe(WebSocket.CLOSED);
    } finally {
      await peer.close();
    }
  },
);

type Leg = { readonly outcome: string; readonly served: number; readonly hops: number };

type RedirectOptions = {
  readonly followRedirects: true;
  readonly maxRedirects?: number;
};

function redirectOptions(maxRedirects: number | undefined): RedirectOptions {
  return maxRedirects === undefined
    ? { followRedirects: true }
    : { followRedirects: true, maxRedirects };
}

/// A peer that answers every request with another redirect to itself.
async function chain(
  make: (url: string, maxRedirects: number | undefined) => WsSocket,
  maxRedirects: number | undefined,
): Promise<Leg> {
  const peer = await scriptedPeer({ first: 302, location: "self/", after: 302 });
  const socket = make(peer.url, maxRedirects);
  let hops = 0;

  const outcome = await new Promise<string>((resolve) => {
    socket.on("redirect", () => {
      hops += 1;
    });
    socket.on("open", () => resolve("open"));
    socket.on("error", (error) => resolve(error.message));
  });

  socket.on("error", () => undefined);
  socket.terminate();
  const served = peer.paths.length;
  await peer.close();

  return { outcome, served, hops };
}

const wsLeg = (url: string, maxRedirects: number | undefined): WsSocket =>
  new WsSocket(url, undefined, redirectOptions(maxRedirects));

const ventiwsLeg = (url: string, maxRedirects: number | undefined): WebSocket =>
  new WebSocket(url, undefined, undeclared(redirectOptions(maxRedirects)));

test.each([
  { label: "0", maxRedirects: 0, served: 1 },
  { label: "1", maxRedirects: 1, served: 2 },
  { label: "4", maxRedirects: 4, served: 5 },
  // Both default to 10, so the eleventh request is the one that is refused.
  { label: "the default", maxRedirects: undefined, served: 11 },
] as const)(
  "a chain follows maxRedirects $label hops and then refuses",
  { timeout: TEST_TIMEOUT_MS },
  async ({ maxRedirects, served }) => {
    const reference = await chain(wsLeg, maxRedirects);
    const actual = await chain(ventiwsLeg, maxRedirects);
    expect(reference.served).toBe(served);
    expect(reference.hops).toBe(served - 1);
    expect(actual).toEqual(reference);
    expect(actual.outcome).toBe("Maximum redirects exceeded");
  },
);
