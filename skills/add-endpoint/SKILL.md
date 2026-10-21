---
name: add-endpoint
description: Add an HTTP endpoint or a new resource (routes, validation, service, SQL, tests) to a Bun + Elysia project created with create-bun-api, following its conventions, then prove it with bun run verify. Use when asked to add a route, endpoint, API resource, CRUD feature, or handler in a project that contains create-bun-api.json.
---

# Add an endpoint

1. **Baseline:** run `bun run verify`. If it already fails, fix that first (verify-and-debug skill) or
   report it. Don't build on a red baseline.
2. **Decide where the code goes:**
   - New resource: a new folder `src/modules/<name>/`. `<name>` is plural and lowercase, e.g. `notes`.
   - New route on an existing resource: that module's `<name>.routes.ts`, with logic in `<name>.service.ts`.
   - New table or column: follow the add-model skill first.
3. **Write the module.** A complete, tested example is in
   [references/notes-module.md](references/notes-module.md); copy its shape.
   - `<name>.schema.ts`: `t` schemas for bodies, params, and responses, plus `typeof X.static` types.
   - `<name>.repository.ts`: prepared SQL. Scope rows by owner (`user_id`) for per-user data.
   - `<name>.service.ts`: business rules. Throw `notFound()`, `conflict()`, and the other helpers from `src/lib/errors.ts`.
   - `<name>.routes.ts`: `new Elysia({ prefix: "/<name>", tags: ["<name>"] })`. Add
     `.use(authPlugin(deps.tokens))` when any route sets `auth: true`. Declare `body`, `params`, `query`,
     and `response` on every route.
   - `<name>.test.ts`: use `createTestApp()` and `signUp()` from `test/helpers.ts`.
4. **Mount it** in `src/app.ts`: create the service from `db`, then `.use(<name>Routes({ ... }))`.
5. **Prove these behaviors in tests:**
   - Invalid input returns 400 with `error.code` `VALIDATION` (the declared schema handles this).
   - A missing or invalid token returns 401.
   - Another user's resource returns 404, not 403.
   - Create returns `status(201, value)`. Delete returns `status(204, undefined)`, with `204: t.Void()` in `response`.
6. **Finish:** run `bun run format` (fixes formatting and import order), then `bun run verify`. You're done
   only when it passes. New routes appear automatically at `/docs`.

## Gotchas

- Returning `{ status: 401, body }` sends HTTP **200**. Throw the error helpers instead.
- `status(204)` without a body fails the typecheck once a `response` map is declared.
  Use `status(204, undefined)` and `204: t.Void()`.
- Path params declared as `t.Integer()` are converted from the URL string, so `/notes/abc` returns 400.
- Never log request bodies, headers, or tokens.
