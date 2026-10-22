// The redirect peers the client suites name, built on the one scripted listener.

import { SELF, scriptedPeer, type RedirectPeer } from "./redirect-peer";

/// A peer that completes a handshake, and is the destination of a redirect.
export function handshakePeer(): Promise<RedirectPeer> {
  return scriptedPeer({ first: 101, after: 101 });
}

/// A peer that answers the first request with a redirect and completes the next.
export function redirectingPeer(location: string): Promise<RedirectPeer> {
  return scriptedPeer({ first: 302, location, after: 101 });
}

/// A peer that redirects to itself, which is the one case where a redirect keeps its
/// host *and* its port, and so the one case where credentials survive the hop.
export function selfRedirectPeer(path: string): Promise<RedirectPeer> {
  return scriptedPeer({ first: 302, location: `${SELF}${path}`, after: 101 });
}
