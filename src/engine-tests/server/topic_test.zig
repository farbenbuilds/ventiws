//! Unit tests for `src/engine/server/topic.zig`.

const std = @import("std");
const topic = @import("../../engine/server/topic.zig");

test "a topic with both counters at their widest fits" {
    var buffer: [topic.topic_capacity]u8 = undefined;
    const written = topic.write_topic(&buffer, std.math.maxInt(u32), std.math.maxInt(u32));
    try std.testing.expectEqualStrings("ventiws:conn:4294967295:4294967295", written);
    try std.testing.expectEqual(topic.topic_capacity, written.len);
}

test "an ordinary pair writes only the digits it needs" {
    var buffer: [topic.topic_capacity]u8 = undefined;
    try std.testing.expectEqualStrings("ventiws:conn:7:12", topic.write_topic(&buffer, 7, 12));
}
