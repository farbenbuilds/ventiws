// RFC 7692 negotiation in both directions, as tables. A server reads offers, a
// client reads answers, and a window this build cannot honour is a refusal.

import { expect, test } from "vitest";
import { acceptAsClient, acceptAsServer } from "../../../src/compat/extensions/deflate";
import { parseExtensions, type ParsedExtension } from "../../../src/compat/extensions/grammar";
import { offer } from "../../../src/compat/extensions/offer";
import { normalizePerMessageDeflate } from "../../../src/compat/options/shared";
import type { NormalizedPerMessageDeflate } from "../../../src/types/options";

const DEFAULTS = normalizePerMessageDeflate(undefined, true);
const NEGOTIATED = "permessage-deflate; server_no_context_takeover; client_no_context_takeover";

type Options = NormalizedPerMessageDeflate | false;

type Outcome = "none" | "accepted" | "refusal";

function configurations(header: string): readonly ParsedExtension[] {
  return parseExtensions(header).get("permessage-deflate") ?? [];
}

function one(header: string): ParsedExtension {
  const found = configurations(header)[0];

  if (found === undefined) throw new Error(`no permessage-deflate in ${header}`);

  return found;
}

function serverOutcome(header: string, options: Options = DEFAULTS): Outcome {
  const outcome = acceptAsServer(configurations(header), options);

  return outcome === null ? "none" : "accepted" in outcome ? "accepted" : "refusal";
}

function serverHeader(header: string, options: Options = DEFAULTS): string | undefined {
  const outcome = acceptAsServer(configurations(header), options);

  if (outcome === null) return undefined;

  return "accepted" in outcome ? outcome.accepted.header : outcome.refusal;
}

function clientOutcome(header: string, options: Options = DEFAULTS): Outcome {
  const outcome = acceptAsClient(one(header), options);

  return outcome === null ? "none" : "accepted" in outcome ? "accepted" : "refusal";
}

const OPTION = (bits: number | undefined): Options =>
  normalizePerMessageDeflate({ serverMaxWindowBits: bits }, true);

test.each([
  ["the default offer", "permessage-deflate; client_max_window_bits"],
  ["a bare offer", "permessage-deflate"],
  ["a client window below 15", "permessage-deflate; client_max_window_bits=10"],
  ["a server window of 15", "permessage-deflate; server_max_window_bits=15"],
  ["the second configuration", "permessage-deflate; server_max_window_bits=10, permessage-deflate"],
])("%s is accepted", (_name, header) => {
  expect(serverHeader(header)).toBe(NEGOTIATED);
});

test("the extension off accepts nothing", () => {
  expect(serverOutcome("permessage-deflate", false)).toBe("none");
  expect(clientOutcome("permessage-deflate", false)).toBe("none");
});

test.each([8, 9, 10, 11, 12, 13, 14])("a server window option of %i is declined", (bits) => {
  // The compressor emits 15 at every level, so a below-15 option can only be answered
  // with a lie; declining is the documented divergence.
  expect(serverOutcome("permessage-deflate", OPTION(bits))).toBe("refusal");
});

test.each([undefined, 15])("a server window option of %s still negotiates", (bits) => {
  expect(serverHeader("permessage-deflate", OPTION(bits))).toBe(NEGOTIATED);
});

test.each([
  [
    "a duplicated parameter",
    "permessage-deflate; server_max_window_bits=10; server_max_window_bits=10",
  ],
  ["a window below the legal range", "permessage-deflate; client_max_window_bits=7"],
  ["a window above the legal range", "permessage-deflate; client_max_window_bits=16"],
  ["a non-numeric window", "permessage-deflate; client_max_window_bits=ten"],
  ["a valueless server window", "permessage-deflate; server_max_window_bits"],
  ["a value on a valueless parameter", "permessage-deflate; client_no_context_takeover=1"],
  ["an unknown parameter", "permessage-deflate; unknown"],
])("a server refuses %s", (_name, header) => {
  expect(serverOutcome(header)).toBe("refusal");
});

test("a client offer always names both no-context-takeover parameters", () => {
  expect(offer(DEFAULTS)).toBe(NEGOTIATED);
  expect(offer(normalizePerMessageDeflate({ serverMaxWindowBits: 10 }, true))).toBe(NEGOTIATED);
});
