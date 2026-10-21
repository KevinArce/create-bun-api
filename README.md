# bun-cli (retired)

This crate is retired and no longer creates projects. Version 0.4.0 only prints where to go and exits
with status 1. Earlier versions are yanked: they could run a remote install script without asking,
and they generated a template that no longer works.

## Use create-bun-api instead

[create-bun-api](https://www.npmjs.com/package/create-bun-api) replaces it. It needs
[Bun](https://bun.com) 1.4 or newer, and no Rust toolchain.

```bash
bun create bun-api my-api
cd my-api && bun run dev
```

It creates an Elysia + SQLite + JWT API that passes its own `verify` script. The project comes with
`AGENTS.md` and Agent Skills for AI coding agents.

Source and docs: https://github.com/KevinArce/create-bun-api

## Removing this binary

```bash
cargo uninstall bun-cli
```

## License

MIT OR Apache-2.0
