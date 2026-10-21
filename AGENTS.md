# create-bun-api

A toolkit that scaffolds agent-ready Bun HTTP APIs. It has three parts:

- `src/`: the CLI (TypeScript on Bun, zero runtime dependencies). Its public contract is `src/manifest.ts`.
- `templates/api/`: the template, a real runnable project with its own `bun.lock`, tests, and `AGENTS.md`.
- `skills/`: Agent Skills (`SKILL.md`), copied into generated projects and also installable on their own.

**Releases:** never publish to npm or crates.io without the owner's explicit go-ahead. The roadmap is
`docs/PLAN.md`; the reasons behind it are in `docs/decisions/`.

## Commands

| Task | Command |
| --- | --- |
| Setup | `bun install && (cd templates/api && bun install)` |
| Run the CLI | `bun src/cli.ts <dir> [flags]`, e.g. `bun src/cli.ts /tmp/demo --json` |
| All tests (about 30 s) | `bun test tests` |
| Fast subset | `bun test tests/unit.test.ts tests/contract.test.ts` |
| Template checks | `cd templates/api && bun run verify` |
| Everything CI would run | `bun run ci` |

## Rules

- **Contract changes** (commands, flags, exit codes, error codes, JSON fields) start in `src/manifest.ts`
  and `schemas/result.v1.json`. Tests compare the two. Removing or renaming anything is a breaking
  change: bump the schema id (for example `bun-api/result@2`).
- Every expected failure is a `CliError(code, message, hint)`. The hint says what to do next.
  Never exit 0 after a failed step.
- `new` builds in a temporary sibling directory and renames it into place at the end, so a failed run
  leaves nothing behind. `tests/faults.test.ts` checks this; keep it true.
- The CLI never prompts without a TTY, never runs remote scripts, and never goes through a shell:
  `run()` takes an argv array.
- With `--json`, stdout carries exactly one JSON object. Human progress goes to stderr.
- **Templates** contain no template syntax. The only substitution is the placeholder
  `bun-api-template-app`, in the files listed in `TEMPLATES[].substituteIn`. Dotfiles that npm drops are
  stored without the dot (`gitignore`) and renamed on copy through `rename`.
- **Template changes:** edit `templates/api`, run its `bun run verify`, then `bun test tests/e2e.test.ts`.
  Update its lockfile by running `bun install` in that directory. Never hand-edit `bun.lock`.
- **Skills:** `name` equals the directory name. `description` says what the skill does and includes
  "Use when …". The body stays under 500 lines, with details in `references/`. `tests/skills.test.ts`
  applies the code in `skills/add-endpoint/references/notes-module.md` to a new project and runs verify.
  Regenerate that file from a working project; don't edit it blindly.
- Keep every `AGENTS.md` at 150 lines or fewer (a test checks this).

## Layout

```
src/cli.ts         argv → command → result → output and exit code
src/manifest.ts    commands, flags, exit and error codes, templates (the single source of truth)
src/commands/      new.ts, doctor.ts, describe.ts
src/engine/        name validation, file planning, subprocess runner, version comparison
schemas/           JSON Schema for --json output
templates/api/     the API template; its own AGENTS.md describes its conventions
skills/            create-bun-api (for the toolkit), plus add-endpoint, add-model, verify-and-debug (copied into projects)
tests/             unit, contract, faults (failure injection), e2e, skills
evals/             agent task evaluations (see evals/README.md)
docs/              PLAN.md, decisions/
```

## Test-only hook

`BUN_API_TEMPLATES_DIR` points the CLI at another templates directory. Tests use it to inject
broken templates. It isn't part of the public contract.
