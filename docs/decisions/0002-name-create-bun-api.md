# ADR 0002: Name the package `create-bun-api`

- Status: accepted (2026-10-21)
- Amends: [ADR 0001](0001-agent-first-redesign.md), which used the working name `bunstack`

## Context

The name should be easy for an AI agent to find and to guess:

- **Findable:** it contains the words a user or agent would search for ("bun", "api", "create").
- **Guessable:** `bun create <name>` runs `bunx create-<name>`, so the invocation follows from the name.
- **Publishable:** npm rejects a new name that equals an existing one once punctuation is removed
  ([npm's rule](https://blog.npmjs.org/post/168978377570/new-package-moniker-rules)).
- **Safe to guess wrong:** if an agent tries `bunx <name>` and someone else owns `<name>`, it runs a
  stranger's code.

Registry checks on 2026-10-21:

| Candidate | Result |
| --- | --- |
| `bunstack`, `create-bunstack` | Free, but **unpublishable**: `bun-stack` and `create-bun-stack` exist. |
| `create-bun-api` | Free, and nothing normalizes to `createbunapi`. Publishable. |
| `bun-api` | Blocked for everyone by `bunapi` (an image API last published in 2022, 29 downloads a month). |
| `bunkit`, `create-bunkit` | Taken. |

## Decision

- npm package and bin: **`create-bun-api`**. Usage: `bun create bun-api my-api` or `bunx create-bun-api <command>`.
- Short tool name (`TOOL` in `src/manifest.ts`, schema ids `bun-api/result@1`): `bun-api`.
- Provenance file in generated projects: `create-bun-api.json`.
- The toolkit skill keeps the name `create-bun-api`, matching the package.

## Consequences

- No one can publish `bun-api` because of `bunapi`, so `bunx bun-api` fails with a 404 instead of
  running someone else's code. Tools and docs always use the `create-bun-api` form.
- The name says "API". If non-API templates are added later, they still fit under the same tool,
  but the name will undersell them.
- The GitHub repository was renamed from `bun-cli` to `create-bun-api` on 2026-10-21. Stars and
  issues carried over, and GitHub redirects the old URL.
