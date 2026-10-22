//! The compiled capacities as a JavaScript object, split from `server_io.zig` so the
//! codec-only addon reports them without importing the engine.

const napi = @import("napi-zig");
const capacities = @import("../server/capacities.zig");
const codec_abi = @import("codec_abi.zig");
const codec_caps = @import("../codec/capacities.zig");

/// Compile-time constants with no server behind them, so there is no handle and no failure.
pub fn engine_limits(env: napi.Env) !napi.Val {
    var out: [7]napi.Val = undefined;
    out[0] = try env.createUint32(capacities.connection_capacity);
    out[1] = try env.createUint32(capacities.message_capacity);
    out[2] = try env.createUint32(capacities.frame_capacity);
    out[3] = try env.createUint32(@intCast(capacities.inbound_slots));
    out[4] = try env.createUint32(@intCast(capacities.payload_slots));
    // What a `maxFragments` option is measured against, reported rather than guessed at.
    out[5] = try env.createUint32(@intCast(codec_caps.max_fragments));
    // The ceiling a codec's `maxPayload` may not exceed, so a caller learns before connecting.
    out[6] = try env.createUint32(codec_abi.ceiling_arg_max);
    // NUL-terminated because `setNamedProperty` takes a sentinel slice.
    const names = [_][:0]const u8{
        "connectionCapacity",
        "messageBytes",
        "frameBytes",
        "inboundSlots",
        "outboundSlots",
        "maxFragments",
        "maxPayloadBytes",
    };
    const object = try env.createObject();
    for (names, out) |name, value| {
        try object.setNamedProperty(env, name, value);
    }
    return object;
}
