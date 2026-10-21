//! `bun-cli` is retired. Its replacement is the npm package `create-bun-api`:
//! <https://github.com/KevinArce/create-bun-api>
//!
//! This binary only explains where to go. It never reads stdin, never runs other programs,
//! and always exits with status 1, so scripts and agents notice it did nothing.

use std::process::ExitCode;

const MESSAGE: &str = "\
bun-cli is retired and no longer creates projects.

Use create-bun-api instead. It needs Bun 1.4 or newer and no Rust toolchain:

    bun create bun-api my-api

Docs: https://github.com/KevinArce/create-bun-api
Remove this binary: cargo uninstall bun-cli
";

fn main() -> ExitCode {
    eprint!("{MESSAGE}");
    ExitCode::from(1)
}
