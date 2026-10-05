// The files that state the version, and the pattern that captures it in each, so
// `bump-version.mjs` can rewrite the digits without parsing a document.
//
// The surfaces cannot import each other -- a manifest, a Zig build manifest, a document,
// and the example manifests -- so they live here for the release step and for the tests
// that hold them to `package.json`.

/// The pin in each example manifest.
const VENTIWS_PIN = /("ventiws":\s*")([^"]+)(")/;

/// Every pattern captures the version between its delimiters, so a rewrite touches the
/// digits alone and needs no parser; the Zig manifest and the README are not JSON.
export const SOURCES = [
  { path: "package.json", pattern: /("version":\s*")([^"]+)(")/ },
  { path: "build.zig.zon", pattern: /(\.version\s*=\s*")([^"]+)(")/ },
  { path: "README.md", pattern: /(is at\s*`)([^`]+)(`)/ },
  // Each example pins the release, so a fresh checkout installs what shipped instead of
  // whatever the `latest` dist-tag points at; the pin moves with the release.
  { path: "examples/vanilla-ventiws/package.json", pattern: VENTIWS_PIN },
  { path: "examples/bun-ventiws/package.json", pattern: VENTIWS_PIN },
  { path: "examples/deno-ventiws/package.json", pattern: VENTIWS_PIN },
  { path: "examples/effect-rpc-ventiws/package.json", pattern: VENTIWS_PIN },
  { path: "examples/express-session-ventiws/package.json", pattern: VENTIWS_PIN },
];
