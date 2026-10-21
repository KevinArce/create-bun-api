---
name: verify-and-debug
description: Prove a create-bun-api project works and fix failures, using bun run verify (typecheck, lint, tests, then boot and GET /health) and its JSON report. Use when finishing any task (before saying it is done), when tests or the typecheck fail, when the server won't start, or when asked to check, debug, or validate the project.
---

# Verify and debug

1. Run `bun run verify --json`. It prints `{ "ok": …, "steps": [{ "id", "ok", "ms", "command", "output"? }] }`.
   `output` holds the last 40 lines of a failing step. Every step runs even after a failure.
2. Fix failures in this order, because earlier ones often cause later ones:

| Step | Reproduce alone | Usual causes |
| --- | --- | --- |
| `typecheck` | `bun run typecheck` | Wrong import path. A status code missing from the route's `response` map (for 204, use `status(204, undefined)` and `204: t.Void()`). Possibly-`undefined` values from indexed access (`noUncheckedIndexedAccess`). |
| `lint` | `bun run lint` | Run `bun run format` first; it fixes formatting and import order. Whatever remains is real: unused code or `any`. |
| `test` | `bun test <file>` or `bun test -t "<name>"` | Read the expected-versus-received diff. A wrong HTTP status usually means an object was returned instead of an error helper thrown. |
| `boot` | `PORT=3999 DATABASE_PATH=:memory: JWT_SECRET=$(openssl rand -hex 32) bun src/index.ts` | A config error (the message lists every problem), an exception at import time, or bad migration SQL. |

3. Rerun `bun run verify --json` until `ok` is `true`. Then report which steps ran.

## Never make verify pass by

- deleting, skipping (`test.skip`), or loosening tests to match wrong behavior;
- adding `@ts-ignore`, `as any`, or `biome-ignore` to hide a real problem;
- lowering password-hashing cost, shortening `JWT_SECRET` checks, or removing validation.

If a test really is wrong, change it and explain why in your report.

## Runtime clues

`bun run dev` writes JSON log lines. Unexpected failures appear as `"level":"error"` with
`"msg":"unhandled error"` and the error's name, message, and stack (secrets are redacted).
