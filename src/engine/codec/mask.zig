//! RFC 6455 masking with the widest compiled vector the target supports. The public
//! codec and the engine route used to share this through uWebZockets; the codec owns it
//! now so the published addon does not link the engine for a mask.

const builtin = @import("builtin");
const std = @import("std");
const zslay = @import("zslay");

/// A full 256-bit XOR on AVX2, otherwise the baseline 128-bit SSE2/NEON lane. The tail
/// is always scalar, so a payload does not have to be vector-sized.
const vector_lane_count: usize = switch (builtin.cpu.arch) {
    .x86, .x86_64 => if (std.Target.x86.featureSetHas(builtin.cpu.features, .avx2)) 32 else 16,
    .aarch64, .aarch64_be => 16,
    else => 16,
};
const Vector = @Vector(vector_lane_count, u8);
const use_simd = switch (builtin.cpu.arch) {
    .x86, .x86_64 => std.Target.x86.featureSetHas(builtin.cpu.features, .sse2),
    .aarch64, .aarch64_be => std.Target.aarch64.featureSetHas(builtin.cpu.features, .neon),
    else => false,
};

/// Applies an RFC 6455 mask using the best compiled CPU path.
pub fn apply(buffer: []u8, masking_key: zslay.MaskingKey, position: u64) void {
    if (comptime use_simd) return apply_simd(buffer, masking_key, position);
    return apply_scalar(buffer, masking_key, position);
}

/// Applies a mask without vector instructions for portable fallback and tests.
pub fn apply_scalar(buffer: []u8, masking_key: zslay.MaskingKey, position: u64) void {
    for (buffer, 0..) |*byte, offset| {
        const absolute = position +% @as(u64, @intCast(offset));
        byte.* ^= masking_key[absolute % masking_key.len];
    }
}

/// Applies a mask in full vectors followed by a scalar tail.
pub fn apply_simd(buffer: []u8, masking_key: zslay.MaskingKey, position: u64) void {
    if (buffer.len == 0) return;

    var key_bytes: [vector_lane_count]u8 = undefined;
    for (&key_bytes, 0..) |*byte, index| {
        const key_index: usize = @intCast(
            (position +% @as(u64, @intCast(index))) % masking_key.len,
        );
        byte.* = masking_key[key_index];
    }
    const key_vector: Vector = key_bytes;

    var offset: usize = 0;
    while (offset + @sizeOf(Vector) <= buffer.len) : (offset += @sizeOf(Vector)) {
        const vector: *align(1) Vector = @ptrCast(buffer[offset..].ptr);
        vector.* = vector.* ^ key_vector;
    }

    apply_scalar(buffer[offset..], masking_key, position +% offset);
}
