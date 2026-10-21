# Roadmap: create-bun-api, an agent-first Bun API toolkit

Redesign agreed on 2026-10-20 ([ADR 0001](decisions/0001-agent-first-redesign.md)). The npm name is
`create-bun-api`, used as `bun create bun-api <dir>` ([ADR 0002](decisions/0002-name-create-bun-api.md)).

**Release rule:** publishing to npm or crates.io needs the owner's explicit go-ahead for each release.
`bun run ci` runs the same checks as `.github/workflows/ci.yml` locally (about 25 s).

Legend: `[x]` done · `[ ]` open · `[~]` blocked (reason given)

## Done

- **Template** (`templates/api`): Elysia 1.4, `bun:sqlite`, `jose`, OpenAPI. Typed `HttpError` statuses,
  validated config, redacting JSON logger, `/health`, 31 tests, `bun run verify` (`--json`), `AGENTS.md`,
  committed `bun.lock`. No external services.
- **CLI** (`src/`): `new`, `doctor`, `describe`. `--json` output against `schemas/result.v1.json`,
  exit codes 0–6, `error.code` + `hint`. Never prompts without a TTY, never runs remote scripts, and
  builds in a temp directory that it renames into place. 72 tests, mutation-checked.
- **Skills** (`skills/`): `create-bun-api`, `add-endpoint`, `add-model`, `verify-and-debug`. Copied into
  `.agents/skills/` and `.claude/skills/`; reference code is applied to a new project and verified.
- **Eval harness** (`evals/`): 3 tasks, hidden black-box acceptance tests, toolkit vs baseline arms.
  The oracle and noop self-tests run in CI.
- Rust implementation and the old template removed (history keeps them; the last Rust commit is `85e944f`).

## Milestone 1: Revamp on `master`
- [x] Commit the redesign and push to `master`
- [x] First GitHub Actions run green on ubuntu and macOS, Bun 1.4.0 and latest (2026-10-21), which
      confirms `MIN_BUN_VERSION` 1.4.0

## Milestone 2: on npm (0.1.1 is `latest`, 2026-10-21)
- [x] `LICENSE-MIT` and `LICENSE-APACHE` (canonical texts), included in the package
- [x] `tests/pack.test.ts`: the packed tarball has the right files, installs, and creates a project
      that passes verify
- [x] `CHANGELOG.md`, `scripts/check-release.ts` (`bun run release:check`), and `docs/releasing.md`
- [x] `.github/workflows/release.yml`: on `v*` tags it runs every check, packs, and runs
      `npm stage publish` through trusted publishing (OIDC), for the owner to approve with 2FA.
      It skips versions already on npm.
- [x] `npx skills add KevinArce/create-bun-api --list` finds all 4 skills from the public repo (skills@1.5.22)
- [x] 0.1.0 published by hand (2026-10-21, before the repo rename, so its metadata uses the old URL,
      which redirects). The tarball is byte-identical to the tested one. Tagged `v0.1.0` at `da6fa40`,
      the commit it was built from.
- [x] Registry checks in a fresh environment: `bunx create-bun-api@0.1.0 describe` and
      `bun create bun-api demo` (every step ok)
- [x] `0.0.0-stage` placeholder (created by npm during the first publish) deprecated
- [x] Trusted publisher configured (KevinArce / create-bun-api / `release.yml` / environment `npm`, stage-only)
- [x] 0.1.1 released through CI: staged by GitHub Actions, verified byte-identical to a local pack
      of `v0.1.1`, and approved with 2FA. Published with a provenance attestation (SLSA v1). A fresh
      `bun create bun-api demo` passes every step. GitHub releases exist for `v0.1.0` and `v0.1.1`.
- [ ] **Owner:** turn off token publishing: npmjs.com → create-bun-api → Settings → Publishing access →
      "Require two-factor authentication and disallow tokens" (docs/releasing.md, step 4)
- [x] GitHub repo renamed `bun-cli` → `create-bun-api` (2026-10-21). 11 stars and 2 watchers kept;
      the old URL redirects for the web and for git. `package.json`, the CHANGELOG, and the docs now
      point at the new URL.
- [ ] Optional: Windows. Add `windows-latest` to CI once it passes there; until then, document macOS and Linux

## Milestone 3: Retire the `bun-cli` crate
- Unblocked: `create-bun-api` is live on npm. Needs the owner's go-ahead (publishing to crates.io).
- [ ] Publish a final 0.4.0 whose binary only prints "bun-cli is retired; use `bun create bun-api <dir>`"
      and exits 1, with a README that says the same (build it from `85e944f`, not from `master`)
- [ ] Yank 0.1.0–0.3.2 (`cargo yank --version …`), so `cargo install bun-cli` gets the notice instead of
      the broken generator that could auto-run `curl | bash`
- Don't delete the crate: deleting frees the name for anyone, and existing `cargo install bun-cli`
  users would get whatever they publish.

## Milestone 4: Measure with real agents (owner's separate session)
- [ ] Baseline vs toolkit: `bun evals/run.ts --agent claude --arm both --reps 5 --execute`, then the
      same with `--agent gemini`. This uses agent quota or credits; prefer a container.
- [ ] Read failed transcripts, fix skills and docs, rerun. Record results in `docs/` so later decisions
      cite data.

## Milestone 5: Extend by evidence
Each item needs an e2e matrix entry and an eval showing it helps before it ships.
- [ ] Add-ons: Postgres (`Bun.sql`), Mongo, Sentry, as plugins tested in a CI matrix
- [ ] `agents init`: retrofit `AGENTS.md`, skills, and `verify` into existing Bun repos
- [ ] Renovate (or a scheduled job) to refresh `templates/api/bun.lock`, gated by `verify`
- [ ] Optional vendor adapters (Claude Code plugin with hooks, Codex `openai.yaml`), generated from `skills/`
- [ ] Experimental: an MCP server built from `src/manifest.ts`, only if a client without shell access is a real target
