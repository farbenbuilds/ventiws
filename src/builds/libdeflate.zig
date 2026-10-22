const std = @import("std");

/// libdeflate sources for the codec-only addon. The list matches the engine's own vendor
/// helper, so both routes compress with the same library and the same source revision.
/// Every SIMD variant is selected at runtime, so one list covers x86, ARM, and RISC-V.
const sources = [_][]const u8{
    "lib/utils.c",
    "lib/arm/cpu_features.c",
    "lib/x86/cpu_features.c",
    "lib/deflate_compress.c",
    "lib/deflate_decompress.c",
    "lib/adler32.c",
    "lib/zlib_compress.c",
    "lib/zlib_decompress.c",
    "lib/crc32.c",
    "lib/gzip_compress.c",
    "lib/gzip_decompress.c",
};

pub const Artifacts = struct {
    /// What the addon imports as `libdeflate`; it carries the header path and the archive.
    module: *std.Build.Module,
    library: *std.Build.Step.Compile,
};

/// Builds the pinned libdeflate as a static library and exposes it to the addon. The
/// codec-only route needs DEFLATE but not the engine, BoringSSL, or lsquic.
pub fn build(
    b: *std.Build,
    target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode,
) Artifacts {
    const dependency = b.dependency("libdeflate", .{});
    const root = dependency.path("");
    const c_module = b.createModule(.{
        .target = target,
        .optimize = optimize,
        .link_libc = true,
        .pic = true,
    });
    c_module.addIncludePath(root);
    c_module.addCSourceFiles(.{
        .root = root,
        .files = &sources,
        .flags = &.{
            // Drop unused functions and data from each object, so the linked archive
            // carries only the paths the codec calls.
            "-ffunction-sections",
            "-fdata-sections",
            "-std=gnu11",
            // Match the engine's vendor flags: clang derives these features from evex512,
            // which the per-function target attributes do not request, so runtime dispatch
            // must fall back to the AVX2 and SSSE3 implementations.
            "-DLIBDEFLATE_ASSEMBLER_DOES_NOT_SUPPORT_VPCLMULQDQ",
            "-DLIBDEFLATE_ASSEMBLER_DOES_NOT_SUPPORT_AVX512VNNI",
        },
    });
    const library = b.addLibrary(.{
        .linkage = .static,
        .name = "deflate",
        .root_module = c_module,
    });
    const module = b.createModule(.{
        .root_source_file = b.path("src/builds/libdeflate_module.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });
    module.addIncludePath(root);
    module.linkLibrary(library);
    return .{ .module = module, .library = library };
}
