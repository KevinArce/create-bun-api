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
- [ ] First GitHub Actions run green on ubuntu and macOS, Bun 1.4.0 and latest. The 1.4.0 job is the
      first check of `MIN_BUN_VERSION` below 1.4.2; lower or raise it based on the result.

## Milestone 2: v0.1.0 on npm
- [ ] Add `LICENSE-MIT` and `LICENSE-APACHE` (declared in `package.json`, never present in the repo)
- [ ] Automate the packed-tarball check (`bun pm pack` → install → `bun x create-bun-api` → verify) as a test
- [ ] Publish with provenance: configure npm trusted publishing for this repo, then add a release
      workflow on `v*` tags that runs `bun run ci` before `npm publish --provenance --access public`
- [ ] After publishing: `bun create bun-api demo` and `bunx create-bun-api describe` work from the registry
- [ ] `npx skills add KevinArce/bun-cli` installs the skills (Vercel `skills` CLI)
- [ ] Optional: rename the GitHub repo (for example to `create-bun-api`) and update
      `homepage`/`repository` in `package.json`. GitHub redirects the old URL.
- [ ] Optional: Windows. Add `windows-latest` to CI once it passes there; until then, document macOS and Linux

## Milestone 3: Retire the `bun-cli` crate
- [~] Blocked on Milestone 2: the notice must point at a package that exists.
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
