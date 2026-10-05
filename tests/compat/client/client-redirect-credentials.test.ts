// What a redirect may carry to another origin.
//
// Its own file because it is a security question rather than a routing one. A
// redirect is under the control of whatever answered, so a `Location` naming another
// host must not deliver the credentials the first host was given, and a redirect
// within one host must, because a caller who authenticated expects to still be
// authenticated when the same server sends them elsewhere on itself.

import { expect, test } from "vitest";
import { WebSocket } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { handshakePeer, redirectingPeer, selfRedirectPeer } from "./redirect-peer";
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
    // The security property, and why it is worth a test: a redirect is under the control
    // of whatever answered, so a `Location` naming another host must not deliver the
    // caller's credentials to it.
    const final = await handshakePeer();
    const first = await redirectingPeer(final.url);
    // Credentials in the URL become an `Authorization` header on the first hop, which is
    // the form a redirect has to be careful with.
    const port = new URL(first.url).port;
    const socket = new WebSocket(
      `ws://user:pass@127.0.0.1:${port}`,
      undefined,
      undeclared({ followRedirects: true }),
    );
    try {
      await opened(socket);
      // The first hop carried them and the second did not.
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
  // The complement of the case above, because dropping them unconditionally would be
  // just as wrong as never dropping them: a redirect within one host is the same
  // origin, and a caller who authenticated expects to still be authenticated.
  const peer = await selfRedirectPeer("/same-host-path");
  const port = new URL(peer.url).port;
  const socket = new WebSocket(
    `ws://user:pass@127.0.0.1:${port}`,
    undefined,
    undeclared({ followRedirects: true }),
  );
  try {
    await opened(socket);
    // Both hops went to the same host and port, so both carried the credentials.
    expect(peer.authorizations).toEqual(["Basic dXNlcjpwYXNz", "Basic dXNlcjpwYXNz"]);
  } finally {
    socket.terminate();
    await peer.close();
  }
});

test(
  "caller headers do not survive a redirect to another authority",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    // Caller headers reach every hop through `options.headers`, which `buildRequest`
    // merges into a fresh object each time, so stripping only the current hop's copy
    // puts `authorization` and `cookie` back on the wire at the next authority.
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
      // The first hop carried them and the second did not.
      expect(first.authorizations[0]).toBe("Bearer first-hop");
      expect(first.cookies[0]).toBe("session=1");
      expect(final.authorizations[0]).toBeUndefined();
      expect(final.cookies[0]).toBeUndefined();
    } finally {
      socket.terminate();
      await first.close();
      await final.close();
    }
  },
);

test(
  "caller headers survive a redirect within the same authority",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    // The complement: another path on the same authority is the same server, and a caller
    // that sent credentials expects the next hop to arrive with them.
    const peer = await selfRedirectPeer("/caller-headers");
    const socket = new WebSocket(
      peer.url,
      undefined,
      undeclared({
        followRedirects: true,
        headers: { authorization: "Bearer first-hop", cookie: "session=1" },
      }),
    );
    try {
      await opened(socket);
      expect(peer.authorizations).toEqual(["Bearer first-hop", "Bearer first-hop"]);
      expect(peer.cookies).toEqual(["session=1", "session=1"]);
    } finally {
      socket.terminate();
      await peer.close();
    }
  },
);
