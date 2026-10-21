# bun-api-template-app

An HTTP API built on [Bun](https://bun.com) and [Elysia](https://elysiajs.com), with SQLite storage,
JWT authentication, and OpenAPI docs.

## Quick start

```bash
cp .env.example .env     # skip if .env already exists; set JWT_SECRET (openssl rand -hex 32)
bun install
bun run dev              # http://localhost:3000 · API docs at http://localhost:3000/docs
```

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | no | Liveness and database check |
| POST | `/auth/register` | no | Create an account |
| POST | `/auth/login` | no | Get a bearer token |
| GET | `/users/me` | bearer | The authenticated user |

Errors always look like `{ "error": { "code": "…", "message": "…" } }` with a matching HTTP status.

## Scripts

| Script | What it does |
| --- | --- |
| `bun run dev` | Start with reload |
| `bun test` | Run tests (in-memory database, no setup) |
| `bun run verify` | Typecheck, lint, test, then boot the server and check `/health` |
| `bun run format` | Format and autofix lint issues |

Project layout and coding conventions are in [AGENTS.md](AGENTS.md).
