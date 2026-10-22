//! N-API wrappers for the server lifecycle. Each validates the untrusted config or
//! resolves the generation-checked server handle first; the lifecycle itself stays
//! in `server.zig`, so the exported surface has one small owner.

const napi = @import("napi-zig");
const instance = @import("../server/instance.zig");
const options = @import("../server/options.zig");
const server = @import("../server/server.zig");

pub fn create_server(env: napi.Env, raw: options.RawConfig, dispatch: napi.Callback) !u40 {
    const config = try options.trust(raw);
    return server.create(config, dispatch, env);
}

pub fn listen_server(env: napi.Env, raw: u40) !void {
    const target = instance.lookup(env, raw) orelse return error.UnknownServer;
    try server.listen(target);
}

pub fn close_server(env: napi.Env, raw: u40) !void {
    const target = instance.lookup(env, raw) orelse return error.UnknownServer;
    try server.close(target);
}

pub fn finalize_server(env: napi.Env, raw: u40) !void {
    const target = instance.lookup(env, raw) orelse return error.UnknownServer;
    try server.finalize(target);
}

/// Events the server channel could not queue because its ring was full.
pub fn server_dropped_events(env: napi.Env, raw: u40) !u64 {
    const target = instance.lookup(env, raw) orelse return error.UnknownServer;
    return target.channel.dropped();
}
