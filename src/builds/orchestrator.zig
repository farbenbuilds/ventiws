const std = @import("std");
const napi_zig = @import("napi_zig");
const default_target = @import("targets/default.zig");
const libdeflate = @import("libdeflate.zig");
const platforms = @import("platforms.zig");
const testing = @import("testing.zig");
const vendor = @import("vendor.zig");

/// Wires the published codec-only addon, the development engine addon, build metadata,
/// and the Zig unit tests.
pub fn inject(b: *std.Build) void {
    const target = b.standardTargetOptions(.{ .default_target = default_target.query(b) });
    const optimize = b.standardOptimizeOption(.{});

    const napi_dep = b.dependency("napi_zig", .{});
    const engine_dep = vendor.engine_dependency(b, target, optimize);
    const engine = engine_dep.module("uWebZockets");
    const zslay_dep = b.dependency("zslay", .{ .target = target, .optimize = optimize });
    const zslay = zslay_dep.module("zslay");
    const deflate = libdeflate.build(b, target, optimize);

    const version = vendor.engine_version(b, engine_dep);
    const public_options = options_module(b, version, false);
    const engine_options = options_module(b, version, true);

    napi_zig.addLib(b, napi_dep, .{
        .name = "ventiws",
        .root = b.path("src/lib.zig"),
        .target = target,
        .optimize = optimize,
        .imports = &.{
            .{ .name = "zslay", .module = zslay },
            .{ .name = "libdeflate", .module = deflate.module },
            .{ .name = "build_options", .module = public_options },
        },
        // The npm config only takes effect under `-Dnpm=true`, which the release build
        // adds. It is what cross-compiles the addon per platform and scaffolds the
        // `@ventiws/binding-*` packages, so the per-platform artifact is a build-graph
        // decision rather than something the loader and a workflow agree on by hand.
        // `dts` stays `.none` because TypeScript owns the published types; the loader
        // the toolchain would generate here is also not the one that ships.
        .npm = .{
            .scope = platforms.scope,
            .description = "A drop-in replacement for ws for Node.js, built on the first-party µWebZockets Zig engine via napi-zig.",
            .license = "MIT",
            .repository = "farbenbuilds/ventiws",
            .platforms = platforms.resolve(b),
        },
    });

    // The engine addon is a development, test, and benchmark artifact. A release builds
    // only the codec addon, so the engine and its TLS/QUIC archives never enter a shard.
    const with_engine = b.option(
        bool,
        "engine-addon",
        "Build the development `ventiws-engine` addon alongside the codec addon",
    ) orelse true;
    if (with_engine) {
        napi_zig.addLib(b, napi_dep, .{
            .name = "ventiws-engine",
            .root = b.path("src/lib.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "uWebZockets", .module = engine },
                .{ .name = "zslay", .module = zslay },
                .{ .name = "build_options", .module = engine_options },
            },
        });
    }

    testing.inject(b, .{
        .napi = napi_dep,
        .engine = engine,
        .zslay = zslay,
        .options = engine_options,
        .target = target,
        .optimize = optimize,
    });
}

/// A build-options module per addon: the codec-only addon reports the engine absent, and
/// the engine addon reports it present, so `lib.zig` can gate its engine surface.
fn options_module(b: *std.Build, version: []const u8, engine: bool) *std.Build.Module {
    const options = b.addOptions();
    options.addOption([]const u8, "engine_version", version);
    options.addOption(bool, "engine", engine);
    options.addOption(bool, "http3", engine);
    return options.createModule();
}
