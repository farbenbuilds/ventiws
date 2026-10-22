# First-party forks

A fork is a maintenance obligation, not a new dependency. Every fork stays
tracked against its upstream, carries the smallest possible patch, and is
re-synced on every upstream release. A fork whose patch has been accepted
upstream is retired in the same change.

## napi-zig

- Upstream: [yuku-toolchain/napi-zig](https://github.com/yuku-toolchain/napi-zig)
- Fork: [farbenbuilds/napi-zig](https://github.com/farbenbuilds/napi-zig)
- Base: `v0.3.1` (`1032d3e`)
- Carried patch: `addNpmRelease` uses `options.optimize` instead of a hardcoded
  `ReleaseFast`, so `--release=safe` actually produces `ReleaseSafe` platform
  artifacts. The fork tag is `v0.3.1-ventiws.1`.

### Sync procedure

1. Fetch the upstream tags and default branch. Compare the upstream `build.zig`
   `addNpmRelease` path with the fork; if upstream now honors the optimize
   mode, retire the patch and pin upstream instead of carrying a fork.
2. Branch from the new upstream tag or commit and re-apply only the carried
   patch. Do not fold unrelated upstream work into the ventiws tag.
3. Tag the result as `vX.Y.Z-ventiws.N` and push the tag.
4. In `build.zig.zon`, pin `napi_zig` to the tag plus the resolved commit:
   `git+https://github.com/farbenbuilds/napi-zig?ref=vX.Y.Z-ventiws.N#<commit>`.
5. Regenerate the `zon2nix` files, then run `pnpm build:binding`,
   `pnpm test`, `tests/tooling/release-build-mode.test.ts`, and a release-style
   `node scripts/build-bindings.mjs --platform=linux-x64-gnu`. Confirm the log
   says `ReleaseSafe` and the public artifact loads.

## uWebZockets

`uWebZockets` is first-party to this project and is consumed from
`farbenbuilds/uWebZockets`. The current pin is `v2.0.5` plus
`v2.0.5-ventiws.1`, which packages the libxev overlay and emits function/data
sections for the vendored C and C++ sources. The same sync rule applies when
the engine advances: keep the small ventiws tag, record what it carries here,
and re-run the addon size and conformance checks.

## Rules

- A fork is pinned by tag plus commit, never a moving branch.
- Every carried patch names its upstream file and behavior in this document.
- A sync updates `build.zig.zon`, the generated `zon2nix` files, and the tests
  that hold the dependency contract in the same change.
- Never edit `zig-pkg/**`; it is resolved build input, not source.
