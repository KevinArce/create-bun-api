# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-10-21

### Fixed

- Package metadata (`repository`, `homepage`, `bugs`) now points to the renamed GitHub repository,
  `KevinArce/create-bun-api`. The 0.1.0 links still work through GitHub's redirect.
- The README on npm no longer says the package is unpublished.

## [0.1.0] - 2026-10-21

First release on npm. It replaces the Rust `bun-cli` crate (0.3.x on crates.io).

### Added

- `create-bun-api` CLI, run as `bun create bun-api <dir>` or `bunx create-bun-api`, with the commands
  `new`, `doctor`, and `describe`.
- `--json` output that follows `schemas/result.v1.json`; documented exit codes 0–6; an error code
  and a fix hint on every failure.
- Non-interactive by design: never prompts without a TTY and never runs remote install scripts.
- Builds in a temporary directory and moves the result into place, so a failed run leaves
  nothing behind. A new project must pass its own `bun run verify`.
- `api` template: Elysia 1.4, SQLite (`bun:sqlite`), JWT auth (`jose`), OpenAPI docs, a redacting
  JSON logger, validated config, 31 tests, and a committed lockfile.
- `AGENTS.md` and `CLAUDE.md` in generated projects, plus the Agent Skills `add-endpoint`,
  `add-model`, and `verify-and-debug` in `.agents/skills/` and `.claude/skills/`.
- The `create-bun-api` skill for starting projects, installable on its own.

[Unreleased]: https://github.com/KevinArce/create-bun-api/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/KevinArce/create-bun-api/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/KevinArce/create-bun-api/releases/tag/v0.1.0
