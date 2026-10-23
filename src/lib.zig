//! The published addon's root. It always carries the codec and the compile-time limits;
//! the engine exports are present only when this build is the development engine addon,
//! so the published binary imports neither uWebZockets nor its vendored TLS and QUIC.

const napi = @import("napi-zig");
const build_options = @import("build_options");
const limits_io = @import("engine/ffi/limits_io.zig");
const codec_lifecycle = @import("engine/ffi/codec_lifecycle.zig");
const codec_out = @import("engine/ffi/codec_encode.zig");
const codec_events = @import("engine/ffi/codec_events.zig");
const codec_io = @import("engine/ffi/codec_io.zig");
const codec_status = @import("engine/ffi/codec_status.zig");
const engine_exports = if (build_options.engine) @import("engine_exports.zig") else struct {};

comptime {
    napi.module(@This());
}

/// Version of the pinned uWebZockets engine this tree is built against, for example "2.0.0".
pub fn engine_version() []const u8 {
    return build_options.engine_version;
}

/// The capacities this build was compiled with, a read rather than a latch.
pub const engine_limits = limits_io.engine_limits;

pub const codec_create = codec_lifecycle.codec_create;
pub const codec_destroy = codec_lifecycle.codec_destroy;
pub const codec_feed = codec_io.codec_feed;
/// The offset the last `codec_feed` stopped at, a read rather than a latch.
pub const codec_resume = codec_io.codec_resume;
/// The close code a refused frame maps to, 0 while healthy.
pub const codec_failure_code = codec_status.codec_failure_code;
/// The failure ordinal a refused frame produced, 0 while healthy.
pub const codec_failure = codec_status.codec_failure;
pub const codec_pending = codec_io.codec_pending;
pub const codec_select = codec_io.codec_select;
/// The selected event as `[kind, code, payload]`.
pub const codec_event = codec_events.codec_event;
pub const codec_take = codec_events.codec_take;
/// The fragment boundaries of the selected data message, null when it arrived whole.
pub const codec_fragments = codec_events.codec_fragments;
/// Selects, copies, and retires the next event as `[kindCode, payload, ends]`, or null.
pub const codec_next = codec_events.codec_next;
/// Folds bytes and copies the first event into a caller-owned buffer, in one crossing.
pub const codec_process_into = codec_events.codec_process_into;
/// Copies the selected event into a caller-owned buffer after `codec_process_into`
/// reported it too small.
pub const codec_materialize = codec_events.codec_materialize;
pub const codec_encode = codec_out.codec_encode;
/// Formats one frame into a Node-owned buffer, or a negative encode-failure ordinal.
pub const codec_write = codec_out.codec_write;
/// Formats only the header for a caller writing the payload as its own chunk.
pub const codec_header = codec_out.codec_header;
pub const codec_outbound = codec_out.codec_outbound;
pub const codec_outbound_masked = codec_out.codec_outbound_masked;
pub const codec_reset = codec_io.codec_reset;
pub const codec_ceilings = codec_status.codec_ceilings;

pub const codec_role = codec_status.codec_role;

// Zig 0.16 removed `usingnamespace`, so the engine surface is re-exported name by name.
// In a codec-only build each alias resolves to `void`, a type napi-zig does not register,
// so those names are absent from the published addon rather than exported and failing.
pub const http3_available = if (build_options.engine) engine_exports.http3_available else void;

pub const create_server = if (build_options.engine) engine_exports.create_server else void;
pub const listen_server = if (build_options.engine) engine_exports.listen_server else void;
pub const close_server = if (build_options.engine) engine_exports.close_server else void;
/// Releases the native resources of a closed server, after `serverClosed`.
pub const finalize_server = if (build_options.engine) engine_exports.finalize_server else void;
pub const server_dropped_events = if (build_options.engine) engine_exports.server_dropped_events else void;

pub const send_socket = if (build_options.engine) engine_exports.send_socket else void;
pub const close_socket = if (build_options.engine) engine_exports.close_socket else void;
pub const pause_socket = if (build_options.engine) engine_exports.pause_socket else void;
pub const resume_socket = if (build_options.engine) engine_exports.resume_socket else void;
pub const pump_socket = if (build_options.engine) engine_exports.pump_socket else void;
/// The oldest parsed message for a connection, copied into a JavaScript-owned buffer.
pub const take_socket_message = if (build_options.engine) engine_exports.take_socket_message else void;
pub const purge_socket_message = if (build_options.engine) engine_exports.purge_socket_message else void;
pub const socket_buffered_amount = if (build_options.engine) engine_exports.socket_buffered_amount else void;
/// Inbound messages lost to a refused stage, a pause, or a closed connection.
pub const server_dropped_messages = if (build_options.engine) engine_exports.server_dropped_messages else void;
pub const server_undelivered_messages = if (build_options.engine) engine_exports.server_undelivered_messages else void;
