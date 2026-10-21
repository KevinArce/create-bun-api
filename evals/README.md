# Evals

Measure whether create-bun-api actually helps coding agents, rather than assuming it does.

Each task gives an agent a prompt and then grades the result with **hidden black-box acceptance
tests**. The tests boot the project with `bun run start` and talk HTTP only, so they can grade any
implementation.

| Task | Agent starts in | toolkit arm | Baseline arm |
| --- | --- | --- | --- |
| `create-auth-api` | empty directory | `create-bun-api` skill + `create-bun-api` on PATH | nothing |
| `add-notes` | generated project | full project (AGENTS.md, CLAUDE.md, skills) | same code, agent docs and skills removed |
| `add-user-bio` | generated project | same as above | same as above |

For the two edit tasks, the baseline keeps identical code and removes only the agent-facing layer.
The comparison measures what `AGENTS.md` and the skills add.

## Running

```bash
bun evals/run.ts --agent oracle --arm both      # free: scripted solutions, must all PASS
bun evals/run.ts --agent noop                   # free: does nothing, must all FAIL
bun evals/run.ts --agent claude --arm both      # dry run: prepares workspaces, prints commands
bun evals/run.ts --agent claude --arm both --reps 5 --execute
bun evals/run.ts --agent gemini --task add-notes --reps 5 --execute
```

Options: `--task <id,id|all>`, `--arm toolkit|baseline|both`, `--reps N`, `--model <name>`, `--timeout-min N`.

**`--execute` starts real agents** with auto-approved edits and shell commands inside temporary
directories. It spends your agent quota or API credits. Run it in a container or a disposable VM if you can.
Claude Code runs with `--setting-sources project --strict-mcp-config`, so your personal settings and
MCP servers don't skew the results. The Codex command is wired up but untested.

## Output

One line per run (`PASS`/`FAIL`, acceptance tests passed, workspace path), then a summary per
task and arm: pass rate, median turns, cost, tokens, and minutes. Raw results go to
`evals/runs/<timestamp>-<agent>.json`, which is gitignored. Each workspace keeps `agent-stdout.txt`
and `agent-stderr.txt` for inspection.

## What to look at

- **Pass rate, toolkit versus baseline.** This is the primary signal. Use at least 5 reps per cell;
  agents are noisy.
- **Tokens and turns for passing runs.** These show how efficiently the agent works.
- **Failure modes.** Read the transcripts of failed runs before changing skills or docs.

## Adding a task

Add an entry to `TASKS` in `tasks.ts` (prompt, `prepare`, `oracle`) and a black-box test in
`acceptance/`. A task is ready when the oracle passes and noop fails (`bun run evals:selftest`).
