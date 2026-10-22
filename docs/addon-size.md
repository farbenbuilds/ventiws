# Native addon size

This document records the measured size of `ventiws.node`, the experiments that
were run, and the reduction that shipped. The objective is a smaller native
artifact without weakening `ws` compatibility or the runtime safety checks that
guard peer-controlled WebSocket bytes.

## What ships

The published addon is the **codec route** only. The public `ws` facade uses
Node's `http.Server` and `upgrade` event, and a Zig frame codec over the adopted
`Duplex`; it does not use the µWebZockets server route. ADR 0003 records that
boundary.

Release builds therefore publish `ventiws.node` with no uWebZockets, BoringSSL,
lsquic, or QUIC code. The full engine is built as `ventiws-engine.node` for
tests, Autobahn, and the engine benchmark row, and is never published.

| Target         | Previous full engine | Published codec addon |                 Delta |
| -------------- | -------------------: | --------------------: | --------------------: |
| linux-x64-musl |           14,380,712 |               465,224 | -13,915,488 (-96.76%) |
| linux-x64-gnu  |           14,387,952 |               470,096 | -13,917,856 (-96.73%) |

The development engine addon is 14,380,008 bytes on linux-x64-musl. It carries
the same full ABI the published addon used to expose; only the public artifact
changed.

The public artifact carries the codec, `engineVersion`, and `engineLimits`. It
has no `createServer`, `http3Available`, `sendSocket`, or `pumpSocket`, and a
binary scan finds no `lsquic`, `BoringSSL`, `SSL_`, or `EVP_` symbols.

## Why the earlier section-GC result was not enough

`ReleaseSafe` with `-ffunction-sections`/`-fdata-sections` reduced the full
engine artifact from 15,016,880 to 14,380,712 bytes (-4.24%). Removing only the
engine exports while the codec still imported uWebZockets produced 5,358,064
bytes: the codec used that import for `websocket_mask` and the libdeflate
compression stream, and those references kept the engine's TLS and QUIC
families in the link. The capability probe was not the cause; making
`http3_available` return false saved 64 bytes.

The split removes the import itself:

- masking is `zslay.frame.mask`, the same first-party primitive the engine
  route uses;
- RFC 7692 compression uses a local wrapper over the pinned libdeflate source,
  at the same level and with the same `deflate_raw` framing;
- the codec-only addon links libdeflate and zslay directly, and nothing else.

## Mode comparison

The host baseline is `x86_64-linux-musl`, Zig 0.16.0, Node.js 24.22.1,
`napi-zig` 0.3.1. The comparison remains useful as evidence against shipping a
smaller optimization mode:

| Build                                      |      Bytes | Delta from baseline |
| ------------------------------------------ | ---------: | ------------------: |
| uWebZockets 1.8.0, `ReleaseSafe`           | 15,016,880 |            baseline |
| uWebZockets 1.8.0, `ReleaseFast`           | 14,869,216 |   -147,664 (-0.98%) |
| uWebZockets 1.8.0, `ReleaseSmall`          | 13,968,784 | -1,048,096 (-6.98%) |
| uWebZockets 2.0.0, `ReleaseSafe`, sections | 14,380,712 |   -636,168 (-4.24%) |

`ReleaseSmall` is still rejected for the default release. The codec-only split
removes whole dependency families instead of trading runtime safety for a
compiler mode.

## Reproduce

```sh
pnpm build:binding
stat -c '%s %n' zig-out/lib/ventiws.node zig-out/lib/ventiws-engine.node

node -e 'const a=require("./zig-out/lib/ventiws.node"); console.log(Object.keys(a).sort().join("\n"))'
node -e 'const a=require("./zig-out/lib/ventiws-engine.node"); console.log(a.http3Available())'

node scripts/build-bindings.mjs --platform=linux-x64-gnu
stat -c '%s %n' npm/ventiws/@ventiws/binding-linux-x64-gnu/ventiws.node
```

`tests/tooling/addon-size.test.ts` guards the host public artifact against a
target-specific ceiling. `tests/binding/artifact-split.test.ts` holds the two
export sets apart, and `tests/binding/engine-addon.test.ts` covers the
development engine addon. The arm64 and Darwin sizes are produced by their
native publish shards; the engine dependency is resolved for the build host, so
a cross-target link from this x86_64 host is not a supported measurement path.
