//! The development engine addon's exports: the server lifecycle and the per-connection
//! operations over uWebZockets. `lib.zig` re-exports these only when `build_options.engine`
//! is set, so the published addon never imports this file or the engine behind it.

const uwz = @import("uWebZockets");
const server_io = @import("engine/ffi/server_io.zig");
const socket_inbound = @import("engine/ffi/socket_inbound.zig");
const socket_io = @import("engine/ffi/socket_io.zig");
const socket_pump = @import("engine/ffi/socket_pump.zig");

pub fn http3_available() bool {
    return uwz.http3_available;
}

pub const create_server = server_io.create_server;
pub const listen_server = server_io.listen_server;
pub const close_server = server_io.close_server;
/// Releases the native resources of a closed server, after `serverClosed`.
pub const finalize_server = server_io.finalize_server;
pub const server_dropped_events = server_io.server_dropped_events;

pub const send_socket = socket_io.send_socket;
pub const close_socket = socket_io.close_socket;
pub const pause_socket = socket_io.pause_socket;
pub const resume_socket = socket_io.resume_socket;
pub const pump_socket = socket_pump.pump_socket;
/// The oldest parsed message for a connection, copied into a JavaScript-owned buffer.
pub const take_socket_message = socket_inbound.take_socket_message;
pub const purge_socket_message = socket_inbound.purge_socket_message;
pub const socket_buffered_amount = socket_io.socket_buffered_amount;
/// Inbound messages lost to a refused stage, a pause, or a closed connection.
pub const server_dropped_messages = socket_inbound.server_dropped_messages;
pub const server_undelivered_messages = socket_pump.server_undelivered_messages;
