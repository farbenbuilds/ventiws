// The `client_max_window_bits` a server writes into its answer: `ws` deletes a valueless
// parameter before answering (`permessage-deflate.js:195-199`), so `false` is "name no
// window", not a refusal.

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
  // SAFETY: `false` is the runtime "no window" form; `never` keeps it while matching the declaration.
  return normalizePerMessageDeflate({ clientMaxWindowBits: false as never }, true);
}

test("a valueless client window is accepted when the option names no window", () => {
  const outcome = acceptAsServer(
    configurations("permessage-deflate; client_max_window_bits"),
    noWindowOption(),
  );

  // The parameter is absent, and the connection is still negotiated.
  expect(acceptedHeader(outcome)).toBe(
    "permessage-deflate; server_no_context_takeover; client_no_context_takeover",
  );
});

test("a number still declines an offer naming a smaller window", () => {
  // The option is a ceiling a client's smaller window cannot satisfy.
  const server = normalizePerMessageDeflate({ clientMaxWindowBits: 12 }, true);

  const outcome = acceptAsServer(
    configurations("permessage-deflate; client_max_window_bits=10"),
    server,
  );

  expect(outcome).toHaveProperty("refusal");
});
