//! The fragment count a message may be split into, checked on both sides of the frame that
//! ends it. `ws` counts every data frame of a message, the last one included, so a message
//! of `bound + 1` pieces is a 1008; the non-final bound alone only caught `bound + 2`.

const std = @import("std");
const testing = std.testing;
const codec = @import("../../engine/codec/state.zig");
const limits = @import("../../engine/codec/limits.zig");
const support = @import("frame_support.zig");

const Peer = codec.codec(8);
const KEY = [4]u8{ 1, 2, 3, 4 };

fn bounded(bound: usize) Peer {
    const trusted = limits.Limits.trust(4096, bound, true, false) catch unreachable;
    return Peer.init(.server, trusted) catch unreachable;
}

/// One masked text message split into `pieces` one-byte frames.
fn split_message(buffer: []u8, pieces: usize) []const u8 {
    var at: usize = 0;
    for (0..pieces) |index| {
        const opcode: u8 = if (index == 0) 0x1 else 0x0;
        const last = index == pieces - 1;
        at += support.raw_frame(buffer[at..], last, opcode, 1, true, KEY, "x").len;
    }
    return buffer[0..at];
}

test "a message of exactly the bound is delivered" {
    var peer = bounded(4);
    defer peer.deinit();
    var buffer: [128]u8 = undefined;
    try testing.expectEqual(codec.Outcome.ok, peer.feed(split_message(&buffer, 4)).outcome);
    try testing.expectEqualStrings("xxxx", (try support.take_only(&peer)).payload);
}

test "the bound plus one piece is too many fragments" {
    var peer = bounded(4);
    defer peer.deinit();
    var buffer: [128]u8 = undefined;
    _ = peer.feed(split_message(&buffer, 5));
    try testing.expectEqual(codec.Failure.too_many_buffered_parts, peer.pending_failure().?);
    try testing.expectEqual(@as(u16, 1008), peer.failure_code());
}

test "two pieces past the bound fail on the non-final backstop" {
    var peer = bounded(4);
    defer peer.deinit();
    var buffer: [128]u8 = undefined;
    _ = peer.feed(split_message(&buffer, 6));
    try testing.expectEqual(codec.Failure.too_many_buffered_parts, peer.pending_failure().?);
    try testing.expectEqual(@as(u16, 1008), peer.failure_code());
}
