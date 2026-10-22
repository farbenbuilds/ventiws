# Native addon size

This document records the measured size of `ventiws.node`, the experiments that
were run, and the reduction that shipped. The objective is a smaller native
artifact without weakening `ws` compatibility or the runtime safety checks that
guard peer-controlled WebSocket bytes.

## Production posture

Published addons stay on Zig `ReleaseSafe`. `ReleaseSmall` saves roughly seven
percent on the host measurement, but it changes the failure mode of an invariant
violation in a network parser. That trade is not acceptable for the default
release. `ReleaseSmall` remains an experiment only.

`scripts/build-bindings.mjs` now builds the per-platform release artifacts with
`--release=safe` as well. Before this change it passed `--release=fast`, so the
cross-compiled packages were not built in the mode the project documents.

## Host baseline

The working host is `x86_64-linux-musl`, Zig 0.16.0, Node.js 24.22.1,
`napi-zig` 0.3.1. All sizes are uncompressed `.node` bytes.

| Target         | Build                                                             |      Bytes | Delta from baseline |
| -------------- | ----------------------------------------------------------------- | ---------: | ------------------: |
| linux-x64-musl | uWebZockets 1.8.0, `ReleaseSafe`                                  | 15,016,880 |            baseline |
| linux-x64-musl | uWebZockets 1.8.0, `ReleaseFast`                                  | 14,869,216 |   -147,664 (-0.98%) |
| linux-x64-musl | uWebZockets 1.8.0, `ReleaseSmall`                                 | 13,968,784 | -1,048,096 (-6.98%) |
| linux-x64-musl | uWebZockets 1.8.0, `ReleaseSafe`, `http3_available` returns false | 15,016,816 |         -64 (0.00%) |
| linux-x64-musl | uWebZockets 2.0.0, `ReleaseSafe`, function/data sections          | 14,380,712 |   -636,168 (-4.24%) |
| linux-x64-gnu  | uWebZockets 1.8.0, `ReleaseSafe`                                  | 14,940,872 |            baseline |
| linux-x64-gnu  | uWebZockets 2.0.0, `ReleaseSafe`, function/data sections          | 14,299,920 |   -640,952 (-4.29%) |

The arm64 and Darwin rows are produced by their native publish shards. The
engine dependency is resolved for the build host, so a cross-target link from
the x86_64 host is not a supported measurement path; the release matrix builds
each target on a native runner.

The `http3_available` experiment is the important negative result: the exported
capability probe costs 64 bytes, not the QUIC implementation. Removing the probe
does not make `lsquic` unreachable, because the engine's build graph compiles
and links the QUIC shim and library unconditionally.

## What shipped

`uWebZockets` now emits function and data sections for its vendored C and C++
sources. The linker's existing `--gc-sections` can then discard unused functions
inside an archive member that was pulled in for another symbol. This is a
behavior-preserving build-graph change; `ReleaseSafe` and the WebSocket parser
are unchanged.

The upstream change is pinned by commit
`389558b46f8596599fa87d1b0b2c49e6788a591a` in `build.zig.zon`. It also packages
the `vendor/libxev_overlay` directory that v2.0.0 referenced but omitted from
`.paths`, which is required for a clean `zig fetch`.

## Why the larger HTTP/3 cut did not ship

The preferred reduction is still a compile-time engine profile that excludes
HTTP/3, QUIC, and `lsquic`. uWebZockets 2.0.0 has no such option: `builds/vendor/root.zig`
builds and links `lsquic`, and `builds/targets/native.zig` always compiles
`src/quic/lsquic_shim.c`. A runtime `if` would leave the libraries in the
artifact. Splitting the engine source behind a feature flag is a separate,
reviewable upstream change, and it must prove that the WebSocket-over-HTTP/1.1
path still passes the same conformance and safety tests.

That work is deliberately not mixed into this release. The measured 4.24%
reduction is the low-risk result that is justified by the evidence here.

## Reproduce

```sh
pnpm build:binding
stat -c '%s %n' zig-out/lib/ventiws.node

npx napi-zig build --optimize fast
stat -c '%s %n' zig-out/lib/ventiws.node

npx napi-zig build --optimize small
stat -c '%s %n' zig-out/lib/ventiws.node
```

Cross-platform release sizes are recorded by the publish matrix from the same
`build-bindings.mjs` invocation that stages `npm/`. A host measurement is not a
claim about another target.
