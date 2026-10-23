//! The codec-only build's view of libdeflate; the addon imports this module as `libdeflate`.

pub const c = @cImport({
    @cInclude("libdeflate.h");
});
