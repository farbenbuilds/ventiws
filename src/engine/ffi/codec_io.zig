//! The feed half of the codec boundary: folding bytes in and the small state reads around
//! it. The event half lives in `codec_events.zig`.

const napi = @import("napi-zig");
const abi = @import("codec_abi.zig");
const handles = @import("../codec/handles.zig");

/// Folds bytes into a codec and reports how many it took. A negative return is the negated
/// ordinal into `CODEC_OUTCOME`; the argument is read, never consumed. A count too large to
/// cross is refused, not truncated: a truncated offset is a resume point never reached.
pub fn codec_feed(env: napi.Env, handle: u64, bytes: []const u8) !abi.Count {
    const peer = handles.resolve(env.handle, handle) orelse return abi.feed_refusal(.stale_handle);
    const result = peer.feed(bytes);
    return switch (result.outcome) {
        .ok => abi.count_of(result.consumed) orelse abi.feed_refusal(.failed),
        .backpressure => abi.feed_refusal(.backpressure),
        .failed => abi.feed_refusal(.failed),
    };
}

/// Where the last `codec_feed` stopped. A separate call because the return's sign is
/// already the outcome.
pub fn codec_resume(env: napi.Env, handle: u64) !abi.Count {
    const peer = handles.resolve(env.handle, handle) orelse return abi.feed_refusal(.stale_handle);
    return abi.count_of(peer.resume_at()) orelse abi.feed_refusal(.failed);
}

pub fn codec_pending(env: napi.Env, handle: u64) !abi.Count {
    const peer = handles.resolve(env.handle, handle) orelse return abi.feed_refusal(.stale_handle);
    return abi.count_of(peer.pending()) orelse abi.feed_refusal(.failed);
}

pub fn codec_select(env: napi.Env, handle: u64) !bool {
    const peer = handles.resolve(env.handle, handle) orelse return false;
    return peer.select();
}

/// Drops every buffered byte and event: a half-received frame and a formatted outbound
/// frame are the same slot's state.
pub fn codec_reset(env: napi.Env, handle: u64) !void {
    const peer = handles.resolve(env.handle, handle) orelse return;
    peer.reset();
}
