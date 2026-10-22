# ADR 0003: ship the codec, keep the engine for development

- Status: accepted
- Date: 2026-10-23
- Decides: which native surface the published package carries
- Affects: `src/lib.zig`, `src/engine_exports.zig`, `src/builds/**`,
  `src/binding/**`, `src/engine/codec/**`, `docs/addon-size.md`

## Context

ADR 0002 reduced the addon with section-level linking, but the published
artifact was still about 14 MB. The experiment that removed the engine exports
while leaving the codec's `uWebZockets` import in place produced a 5.1 MB
artifact: the codec used the engine only for `websocket_mask` and the
libdeflate compression stream, and those imports kept the engine's BoringSSL,
lsquic, and QUIC code in the link.

The public `ws` facade does not use the engine server. `WebSocketServer` builds
a Node `http.Server`, `handleUpgrade` adopts the caller's `Duplex`, and every
socket is framed by the Zig codec (`attachSocket`). The engine server route
(`createServer`, `listenServer`, `sendSocket`, `pumpSocket`, the socket slab,
and the engine thread) is used by `tests/binding/**`, the Autobahn harness, and
`bench/echo/native-server.ts`.

Shipping the engine to consumers is therefore the wrong artifact boundary. It
is not a compiler-mode choice and it does not require a smaller engine profile:
the public package should not carry the engine at all.

## Decision

Build two native products from one source tree:

- **`ventiws.node`** is the public addon. It exports the frame codec,
  `engineVersion`, and `engineLimits`. It imports `zslay` and a direct
  libdeflate build. It does not import `uWebZockets`, BoringSSL, or lsquic.
- **`ventiws-engine.node`** is the development addon. It exports the same codec
  surface plus `http3Available`, the server lifecycle, and the socket
  operations. It links the full uWebZockets engine.

`pnpm build:binding` builds both. The release build (`scripts/build-bindings.mjs`)
passes `-Dengine-addon=false`, so `npm/` and `dist/` contain only the public
artifact. `loadAddon()` resolves only the public artifact; `loadEngineAddon()`
resolves only the development artifact and never falls back to the public one.

The codec keeps `zslay` for RFC 6455 framing and masking, and its own
`compression.zig` over the pinned libdeflate package for RFC 7692. The engine
addon uses the engine's libdeflate stream so the two artifacts do not link two
copies of libdeflate.

## Consequences

**Accepted.**

- The download and load footprint follows the code the public facade actually
  runs. Cross-compiling the release matrix no longer builds the engine per
  platform.
- The codec's behavior is unchanged: the masks are the same `zslay` primitive,
  and the deflate wrapper uses the same libdeflate version and level as the
  engine route.
- The development artifact keeps the full engine for the conformance, Autobahn,
  and benchmark evidence, without becoming a second published product.
- `engineLimits()` keeps its existing values on the public artifact. They are
  compiled capacities, not a claim that the engine route is shipped.

**Rejected.**

- _A compile-time HTTP/3/TLS profile only._ It would still ship the engine
  server, the request router, and the QUIC/TLS build graph for a surface the
  public facade never calls.
- _A separate optional engine package._ It adds a second install and version
  contract for a test/bench tool. The development artifact is built from the
  same checkout and is not published.
- _A runtime switch between the two ABIs._ A package that can load the engine
  by accident defeats the boundary; the loaders are explicit.

## What this does not decide

- Whether a future public feature needs the engine server. If it does, it
  becomes an explicit product decision and a loader with its own artifact, not
  an implicit dependency of the codec.
- The exact public size ceiling. It is measured from the codec-only artifact
  and recorded in `docs/addon-size.md`; the guard is target-specific.
