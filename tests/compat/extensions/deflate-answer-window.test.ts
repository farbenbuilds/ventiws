// The `client_max_window_bits` a server writes into its answer.
//
// Split from `deflate-window.test.ts` because that file is about the window an *offer*
// names; `ws` (`permessage-deflate.js:195-199`) accepts a valueless offer and deletes the
// parameter before answering, so `false` is "name no window", not a refusal.

import { expect, test } from "vitest";
import { acceptAsServer } from "../../../src/compat/extensions/deflate";
import { parseExtensions, type ParsedExtension } from "../../../src/compat/extensions/grammar";
import { normalizePerMessageDeflate } from "../../../src/compat/options/shared";
import type { NormalizedPerMessageDeflate } from "../../../src/types/options";

function configurations(header: string): readonly ParsedExtension[] {
  return parseExtensions(header).get("permessage-deflate") ?? [];
}

const acceptedHeader = (outcome: ReturnType<typeof acceptAsServer>): string | undefined =>
  outcome === null ? undefined : "accepted" in outcome ? outcome.accepted.header : outcome.refusal;

/// `false` is reachable at runtime but untyped: `@types/ws` declares a number, so the cast is the gap.
function noWindowOption(): NormalizedPerMessageDeflate | false {
  return normalizePerMessageDeflate(
    { clientMaxWindowBits: false } as unknown as { clientMaxWindowBits: number },
    true,
  );
}

test("a valueless client window is accepted when the option names no window", () => {
  const outcome = acceptAsServer(
    configurations("permessage-deflate; client_max_window_bits"),
    noWindowOption(),
  );
  // The parameter is simply absent: a client asking the server to choose gets no window
  // back, and the connection is still negotiated.
  expect(acceptedHeader(outcome)).toBe(
    "permessage-deflate; server_no_context_takeover; client_no_context_takeover",
  );
});

test("a number still declines an offer naming a smaller window", () => {
  // The option is a ceiling, and a client that names a smaller window than the server is
  // willing to use has asked for something the server cannot grant.
  const server = normalizePerMessageDeflate({ clientMaxWindowBits: 12 }, true);
  const outcome = acceptAsServer(
    configurations("permessage-deflate; client_max_window_bits=10"),
    server,
  );
  expect(outcome).toHaveProperty("refusal");
});
