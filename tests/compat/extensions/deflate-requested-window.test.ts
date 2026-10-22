// The window this server asked for in its own options: a request it cannot honour is a
// refusal rather than a parameter it writes and ignores.

import { describe, expect, test } from "vitest";
import { acceptAsServer } from "../../../src/compat/extensions/deflate";
import { parseExtensions, type ParsedExtension } from "../../../src/compat/extensions/grammar";
import { normalizePerMessageDeflate } from "../../../src/compat/options/shared";

function configurations(header: string): readonly ParsedExtension[] {
  return parseExtensions(header).get("permessage-deflate") ?? [];
}

describe("the window this server asked for", () => {
  test("a server that asked to widen past the offer is refused", () => {
    // `ws`'s comparison at `permessage-deflate.js:167`: it wants more than the client offers.
    const server = normalizePerMessageDeflate({ serverMaxWindowBits: 15 }, true);

    const outcome = acceptAsServer(
      configurations("permessage-deflate; server_max_window_bits=10"),
      server,
    );

    expect(outcome).toHaveProperty("refusal");
  });

  test("a server that will not name a window at all refuses an offer that names one", () => {
    // `ws` compares against `false` (`permessage-deflate.js:166`) and `@types/ws` declares a
    // number, so the cast is the declaration gap.
    // SAFETY: `false` is the runtime form under test; `never` keeps it while matching the declaration.
    const server = normalizePerMessageDeflate({ serverMaxWindowBits: false as never }, true);

    const outcome = acceptAsServer(
      configurations("permessage-deflate; server_max_window_bits=15"),
      server,
    );

    expect(outcome).toHaveProperty("refusal");
  });
});
