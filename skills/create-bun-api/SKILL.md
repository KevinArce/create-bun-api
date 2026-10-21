---
name: create-bun-api
description: Create a new Bun + TypeScript HTTP API project (Elysia, SQLite, JWT auth, OpenAPI docs, tests) with create-bun-api, non-interactively, and confirm it works. Use when asked to start, scaffold, bootstrap, or set up a new backend, REST API, web service, or Bun/Elysia project.
---

# Create a Bun API project

1. Optional, fast: `bunx create-bun-api doctor --json`. If `ok` is false, follow each failed check's
   `hint`. The tool never installs software itself. If Bun is missing, tell the user how to install it
   (https://bun.com/docs/installation); don't run remote install scripts.
2. Create the project:

   ```bash
   bunx create-bun-api <dir> --yes --json        # same as: bun create bun-api <dir> --yes --json
   ```

   This writes the files, installs from the committed lockfile, makes a first git commit (skipped
   inside an existing repo), and runs the project's own `bun run verify`.
   Use `--dry-run` to preview the file list, or `--no-install` when offline.
3. Read the single JSON object on stdout.
   - `ok: true`: `next` lists the commands to run. Read the new project's `AGENTS.md` before editing code.
   - `ok: false`: act on `error.code`. `error.hint` is the next step.

| `error.code` | Exit | What to do |
| --- | --- | --- |
| `USAGE` | 2 | Fix the arguments. `bunx create-bun-api describe` lists every flag. |
| `INVALID_NAME` | 2 | Use the name suggested in `error.hint` (lowercase, digits, `-`). |
| `TARGET_EXISTS` | 4 | Choose another directory. Never delete the existing one unless the user asked. |
| `PREREQUISITE_MISSING` | 3 | Run `doctor --json` and follow the hints. |
| `INSTALL_FAILED` | 5 | Registry or network problem; nothing was written. Retry, or use `--no-install` and run `bun install` later. |
| `VERIFY_FAILED` | 6 | The project was kept. `error.details.failed` holds the failing steps. Use the verify-and-debug skill. |

4. Report to the user: the project path, how to run it (`bun run dev`, API docs at `/docs`), and which
   verify steps passed (from `steps`).

Never pipe answers into the command. With `--yes` it never prompts, and without a TTY it never waits.
