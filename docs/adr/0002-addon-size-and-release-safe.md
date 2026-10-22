# ADR 0002: keep ReleaseSafe and shrink the addon at the build graph

- Status: accepted
- Date: 2026-10-22
- Decides: how the native addon is optimized for size, and what a size reduction
  may not trade away
- Affects: `build.zig.zon`, `src/builds/**`, `scripts/build-bindings.mjs`,
  `docs/addon-size.md`

## Context

The published `ventiws.node` was about 15 MB on the working host. Most of the
bytes are not the N-API glue or the TypeScript facade: the uWebZockets engine
compiles and links BoringSSL, lsquic, libdeflate, and zlib, and the final ELF
carries roughly 11 MB of read-only data plus 3 MB of text.

The cheap experiments were measured first. `ReleaseFast` saved about one
percent, `ReleaseSmall` saved about seven percent, and a manual strip saved
nothing because `napi-zig` already strips non-debug builds and limits Linux
exports. Removing the `http3_available` probe saved 64 bytes, proving that the
probe is not what keeps QUIC in the artifact.

The engine has no compile-time feature profile. `builds/vendor/root.zig` always
builds and links lsquic, and `builds/targets/native.zig` always compiles
`src/quic/lsquic_shim.c`. A runtime branch would leave the code and libraries in
the image.

## Decision

- **Keep `ReleaseSafe` for every published addon.** The parser and FFI boundary
  accept peer-controlled bytes; an invariant violation must remain a diagnosable
  failure rather than undefined native behavior.
- **Adopt the section-level build-graph reduction.** uWebZockets compiles its
  vendored C and C++ sources with `-ffunction-sections` and `-fdata-sections`, so
  the existing `--gc-sections` pass can discard unused code. The host artifact
  drops from 15,016,880 to 14,380,712 bytes, a 4.24 percent reduction, with no
  behavior change.
- **Build the release matrix with `--release=safe`.** The cross-compiled
  packages must use the same mode the project documents and tests.
- **Defer the HTTP/3 and TLS feature cut.** It needs an upstream engine profile
  that removes the dependency family from the build graph, not a ventiws-only
  patch or a runtime switch. It is tracked as follow-up work in
  `docs/addon-size.md`.

## Consequences

**Accepted.**

- The size guard is a build-graph property, so it applies to every target the
  vendor sources compile for.
- The reduction is smaller than a feature cut, but it is reproducible, preserves
  the safety posture, and does not add a second native product to the release
  matrix.
- `uWebZockets` is pinned to the v2.0.5 line plus the packaging and section
  commits; a future engine upgrade must keep both changes or replace them with
  an upstream equivalent.

**Rejected.**

- _Ship `ReleaseSmall` by default._ Saves about seven percent at the cost of
  runtime safety checks in hostile-input paths.
- _UPX or another binary packer._ Moves download bytes at the cost of startup,
  unpacking, antivirus behavior, and a new supply-chain surface.
- _Remove `permessage-deflate` to drop libdeflate._ It is part of the `ws`
  compatibility contract and has its own negotiation tests.
- _A ventiws-only patch of the engine source._ The pinned dependency is
  replaced on resolution; a feature profile belongs upstream.

## What this does not decide

- The exact upstream API for the feature profile (`-Dhttp3=false`,
  `-Dtls=false`, or a capability list). The profile must be structural, default
  to the current behavior, and prove the retained WebSocket path with the
  existing conformance suite.
- Whether a future release publishes a documented slim artifact alongside the
  compatible one. That requires a real customer split and a second release
  matrix, so it is not assumed here.
