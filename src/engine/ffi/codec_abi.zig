//! The codec boundary's vocabulary and numeric widths, defined once because a boundary that
//! defines an ordinal twice defines it wrong once. napi-zig maps a `u64` to a `bigint`.

const std = @import("std");
const capacities = @import("../codec/capacities.zig");
const state = @import("../codec/state.zig");

pub const Count = i32;

/// A byte count as the signed 32-bit `Count` the boundary returns, or null when it cannot
/// cross: a truncated count would name a resume point the caller never reached.
pub fn count_of(value: usize) ?Count {
    if (value > std.math.maxInt(Count)) return null;
    return @intCast(value);
}

/// A width, not a policy: `Arg` is 32 bits, so a larger value arrives already truncated.
pub const ceiling_arg_max: Arg = @intCast(capacities.max_message_bytes);

pub const Arg = u32;

/// What a `feed` call did, as the negative it returns; ordinal 0 is `ok`.
pub const Outcome = enum(u8) { backpressure = 1, failed = 2, stale_handle = 3 };

/// Why an `encode` refused, as the negative it returns; ordinal 0 is no failure, so members start at 1.
pub const EncodeFailure = enum(u8) {
    unexpected_opcode = 1,
    message_too_large = 2,
    protocol_error = 3,
    stale_handle = 4,
};

/// The ordinal-to-event-kind mapping, so a JavaScript ordinal that is not a kind is a typed refusal.
pub fn event_kind(ordinal: Arg) ?state.Kind {
    if (ordinal > state.max_ordinal) return null;
    return @enumFromInt(@as(u8, @intCast(ordinal)));
}

/// The codec's failure vocabulary onto the boundary's, offset by one so zero means "no failure".
pub fn encode_failure(failure: state.Failure) EncodeFailure {
    return switch (failure) {
        .invalid_opcode => .unexpected_opcode,
        .unsupported_message_length, .invalid_mask => .message_too_large,
        else => .protocol_error,
    };
}

/// A `feed` refusal as the negated ordinal; a non-negative return is a byte count.
pub fn feed_refusal(outcome: Outcome) Count {
    return -@as(Count, @intFromEnum(outcome));
}

/// An `encode` refusal, on the same convention as `feed_refusal`.
pub fn encode_refusal(failure: EncodeFailure) Count {
    return -@as(Count, @intFromEnum(failure));
}
