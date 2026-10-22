// `permessage-deflate` negotiation from the client's offer side: the header a client writes
// is its own decision, and a server that omits the response header silently declines it.

import { describe, expect, test } from "vitest";
import { offer } from "../../../src/compat/extensions/offer";
import { normalizePerMessageDeflate } from "../../../src/compat/options/shared";
import type { PerMessageDeflateOptions } from "../../../src/types/ws";

/// `ws`'s own defaults, which these negotiate against.
const DEFAULTS = normalizePerMessageDeflate(undefined, true);

describe("a client writing its offer", () => {
  test("the offer names both no-context-takeover parameters", () => {
    // A bare offer is one a `ws` server silently declines: it omits the response header
    // when the accepted configuration carries no parameters.
    expect(offer(DEFAULTS)).toBe(
      "permessage-deflate; server_no_context_takeover; client_no_context_takeover",
    );
  });

  test("the offer is the same whatever the window options say", () => {
    // The window parameters are never offered: a window this compressor cannot use would be
    // a handshake refusal rather than a smaller message.
    const client = normalizePerMessageDeflate(
      {
        serverMaxWindowBits: 10,
        clientMaxWindowBits: 12,
        serverNoContextTakeover: true,
      } satisfies PerMessageDeflateOptions,
      true,
    );

    expect(offer(client)).toBe(
      "permessage-deflate; server_no_context_takeover; client_no_context_takeover",
    );
  });

  test("the extension off offers nothing", () => {
    expect(offer(false)).toBeUndefined();
  });
});
