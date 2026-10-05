//! Unit tests for `src/engine/channel/callbacks.zig`.

const std = @import("std");
const callbacks = @import("../../engine/channel/callbacks.zig");

test "a fresh channel has no pending events" {
    var channel = callbacks.Channel{};
    try std.testing.expectEqual(@as(u64, 0), channel.pending());
}

test "the ring depth leaves lifecycle headroom above the connections" {
    try std.testing.expect(callbacks.capacity > 2 * @import("../../engine/server/options.zig").connection_capacity);
    try std.testing.expect(std.math.isPowerOfTwo(callbacks.capacity));
}

test "the terminal reserve covers every connection close plus the lifecycle pair" {
    const options = @import("../../engine/server/options.zig");
    try std.testing.expectEqual(@as(usize, options.connection_capacity + 2), callbacks.terminal_reserve);
    try std.testing.expect(callbacks.terminal_reserve < callbacks.capacity);
}

test "the shutdown reserve is the lifecycle pair inside the terminal reserve" {
    try std.testing.expectEqual(@as(usize, 2), callbacks.shutdown_reserve);
    try std.testing.expect(callbacks.shutdown_reserve < callbacks.terminal_reserve);
}

test "a fresh channel has dropped nothing" {
    var channel = callbacks.Channel{};
    try std.testing.expectEqual(@as(u64, 0), channel.dropped());
}

test "a channel with no threadsafe function cannot accept an event" {
    // The probe a caller reads before staging the record its event would claim; the
    // live-`tsfn` case is Node-API state and stays with the binding tests.
    var channel = callbacks.Channel{};
    try std.testing.expect(!channel.can_emit());
}
