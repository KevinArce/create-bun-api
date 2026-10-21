# ADR 0001: Rebuild as an agent-first Bun API toolkit

- Status: accepted (2026-10-20)
- Supersedes: the Rust `bun-cli` 0.3.x design
- Amended by: [ADR 0002](0002-name-create-bun-api.md). The working name `bunstack` used below is
  now `create-bun-api`.

## Context

An audit of `bun-cli` 0.3.2 (run against Bun 1.4.2 and Elysia 1.4.30) found:

- **The CLI could not be driven by agents.** It ignored all flags, hung when stdin was open but silent,
  and treated end-of-input at a Y/n prompt as "yes", which ran `curl -fsSL https://bun.sh/install | bash`.
- **It reported false success.** It exited 0 with "All done!" when all 11 `bun add` calls failed, and
  printed "Template files copied" when the template directory (resolved through the compile-time
  `CARGO_MANIFEST_DIR`) did not exist.
- **The generated project was broken and unsafe.** It had 3 `tsc` errors. Registration always failed
  (argon2 `memoryCost: 4` is rejected by Bun). Auth failures returned HTTP 200 with
  `{"status":401}` in the body. Bearer tokens were written to log files. `.env` was not gitignored.
  It could not boot without MongoDB Atlas credentials.
- **Distribution and naming worked against it.** The tool required a Rust toolchain for a Bun audience
  (the owner's machine has Bun but no Rust), and the npm name `bun-cli` belongs to an unrelated package.

Agents can already run `bun create elysia` and `bun add`. What they lack is proven conventions, a
predictable machine interface, and a way to verify their work.

## Decision

1. **Scope:** a narrow, agent-ready Bun HTTP API starter. One template, done well, before any add-ons.
2. **Language and distribution:** TypeScript on Bun, published (later) as the npm package `create-bunstack`,
   so `bun create bunstack my-api` and `bunx create-bunstack` work with nothing to install.
   The CLI has zero runtime dependencies.
3. **The template is the product.** `templates/api` is a real project with its own `bun.lock` and tests.
   CI runs its `verify` script directly. Code files contain no template syntax; only the project
   name is substituted.
4. **Default persistence is SQLite (`bun:sqlite`),** so `verify` works offline in any sandbox.
   MongoDB, Postgres, and Sentry become optional add-ons later.
5. **Vendor-neutral agent interfaces:** `AGENTS.md` plus a `CLAUDE.md` that imports it (Claude Code
   ignores `AGENTS.md` when a `CLAUDE.md` exists, and `bun init` creates one); Agent Skills
   (`SKILL.md`, base spec fields only) copied into `.agents/skills/` and `.claude/skills/`; a CLI with
   `--json` output and documented exit codes.
6. **Honest outcomes:** every failed step produces a non-zero exit and a machine-readable error with a hint.
   Nothing remote is ever executed.

## Consequences

- The Rust implementation and the old template are removed on this branch. The crates.io crate needs a
  final deprecation release once publishing is allowed (see `docs/PLAN.md`, Phase 0).
- Mongo users must wait for the Mongo add-on.
- **Deviation from the audit:** the audit suggested `pino` for logging. A ~40-line dependency-free JSON
  logger with deep key-based redaction is used instead. Pino's path-based redaction misses keys nested
  at unexpected depths, and the template needs no transports. Swap it if you need pino's features.
- Keeping the template's lockfile current needs a routine (Renovate or a scheduled job), gated by `verify`.
