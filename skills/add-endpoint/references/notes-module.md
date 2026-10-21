# Worked example: a `notes` module

A complete authenticated resource: list, create, get, and delete, with every note scoped to its owner.
This code is applied to a freshly generated project and must pass `bun run verify`
(`tests/skills.test.ts` in the create-bun-api repo checks it).

## 1. Migration: append to the array in `src/db/migrations.ts`

```ts edit=src/db/migrations.ts
  {
    id: "0002_create_notes",
    sql: `
      CREATE TABLE notes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title      TEXT    NOT NULL,
        body       TEXT    NOT NULL DEFAULT '',
        created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX notes_user_id ON notes (user_id);
    `,
  },
```

## 2. Module files

### `src/modules/notes/notes.schema.ts`

```ts file=src/modules/notes/notes.schema.ts
import { t } from "elysia";

export const NoteSchema = t.Object({
  id: t.Integer(),
  title: t.String(),
  body: t.String(),
  createdAt: t.String(),
});

export const CreateNoteBody = t.Object({
  title: t.String({ minLength: 1, maxLength: 200 }),
  body: t.Optional(t.String({ maxLength: 10_000 })),
});

export const NoteParams = t.Object({ id: t.Integer({ minimum: 1 }) });

export type Note = typeof NoteSchema.static;
export type CreateNoteInput = typeof CreateNoteBody.static;
```

### `src/modules/notes/notes.repository.ts`

Every query is scoped by `user_id`.

```ts file=src/modules/notes/notes.repository.ts
import type { Database } from "bun:sqlite";
import type { CreateNoteInput, Note } from "./notes.schema";

type NoteRow = { id: number; user_id: number; title: string; body: string; created_at: string };

const toNote = (row: NoteRow): Note => ({
  id: row.id,
  title: row.title,
  body: row.body,
  createdAt: row.created_at,
});

/** Every query is scoped by user_id, so one user can never read another user's notes. */
export function createNotesRepository(db: Database) {
  const insert = db.query<NoteRow, { userId: number; title: string; body: string }>(
    "INSERT INTO notes (user_id, title, body) VALUES ($userId, $title, $body) RETURNING *",
  );
  const listByUser = db.query<NoteRow, { userId: number }>(
    "SELECT * FROM notes WHERE user_id = $userId ORDER BY id",
  );
  const byIdForUser = db.query<NoteRow, { id: number; userId: number }>(
    "SELECT * FROM notes WHERE id = $id AND user_id = $userId",
  );
  const removeForUser = db.query<unknown, { id: number; userId: number }>(
    "DELETE FROM notes WHERE id = $id AND user_id = $userId",
  );

  return {
    create(userId: number, input: CreateNoteInput): Note {
      const row = insert.get({ userId, title: input.title, body: input.body ?? "" });
      if (!row) throw new Error("INSERT ... RETURNING returned no row");
      return toNote(row);
    },
    listByUser(userId: number): Note[] {
      return listByUser.all({ userId }).map(toNote);
    },
    findForUser(id: number, userId: number): Note | null {
      const row = byIdForUser.get({ id, userId });
      return row ? toNote(row) : null;
    },
    deleteForUser(id: number, userId: number): boolean {
      return removeForUser.run({ id, userId }).changes > 0;
    },
  };
}

export type NotesRepository = ReturnType<typeof createNotesRepository>;
```

### `src/modules/notes/notes.service.ts`

```ts file=src/modules/notes/notes.service.ts
import { notFound } from "../../lib/errors";
import type { NotesRepository } from "./notes.repository";
import type { CreateNoteInput, Note } from "./notes.schema";

/** Another user's note is "not found", not "forbidden": don't reveal that it exists. */
export function createNotesService(repo: NotesRepository) {
  return {
    create: (userId: number, input: CreateNoteInput): Note => repo.create(userId, input),
    list: (userId: number): Note[] => repo.listByUser(userId),
    get(userId: number, id: number): Note {
      const note = repo.findForUser(id, userId);
      if (!note) throw notFound("Note not found");
      return note;
    },
    remove(userId: number, id: number): void {
      if (!repo.deleteForUser(id, userId)) throw notFound("Note not found");
    },
  };
}

export type NotesService = ReturnType<typeof createNotesService>;
```

### `src/modules/notes/notes.routes.ts`

Note `status(204, undefined)` together with `204: t.Void()`.

```ts file=src/modules/notes/notes.routes.ts
import { Elysia, t } from "elysia";
import { ErrorResponse } from "../../lib/errors";
import type { TokenService } from "../../lib/tokens";
import { authPlugin } from "../../plugins/auth";
import { CreateNoteBody, NoteParams, NoteSchema } from "./notes.schema";
import type { NotesService } from "./notes.service";

const security = [{ bearer: [] }];

export const notesRoutes = (deps: { notes: NotesService; tokens: TokenService }) =>
  new Elysia({ prefix: "/notes", tags: ["notes"] })
    .use(authPlugin(deps.tokens))
    .get("/", ({ session }) => deps.notes.list(session.userId), {
      auth: true,
      response: { 200: t.Array(NoteSchema), 401: ErrorResponse },
      detail: { summary: "List your notes", security },
    })
    .post(
      "/",
      ({ session, body, status }) => status(201, deps.notes.create(session.userId, body)),
      {
        auth: true,
        body: CreateNoteBody,
        response: { 201: NoteSchema, 400: ErrorResponse, 401: ErrorResponse },
        detail: { summary: "Create a note", security },
      },
    )
    .get("/:id", ({ session, params }) => deps.notes.get(session.userId, params.id), {
      auth: true,
      params: NoteParams,
      response: { 200: NoteSchema, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse },
      detail: { summary: "Get one of your notes", security },
    })
    .delete(
      "/:id",
      ({ session, params, status }) => {
        deps.notes.remove(session.userId, params.id);
        return status(204, undefined);
      },
      {
        auth: true,
        params: NoteParams,
        response: { 204: t.Void(), 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse },
        detail: { summary: "Delete one of your notes", security },
      },
    );
```

### `src/modules/notes/notes.test.ts`

```ts file=src/modules/notes/notes.test.ts
import { describe, expect, test } from "bun:test";
import { createTestApp, signUp } from "../../../test/helpers";

describe("notes", () => {
  test("every route requires a bearer token", async () => {
    const { request } = createTestApp();
    expect((await request("GET", "/notes")).status).toBe(401);
    expect((await request("POST", "/notes", { body: { title: "x" } })).status).toBe(401);
  });

  test("create, list, get, and delete", async () => {
    const { app, request } = createTestApp();
    const token = await signUp(app);

    const created = await request("POST", "/notes", { token, body: { title: "First" } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: "First", body: "" });

    const list = await request("GET", "/notes", { token });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const path = `/notes/${created.body.id}`;
    expect((await request("GET", path, { token })).status).toBe(200);
    expect((await request("DELETE", path, { token })).status).toBe(204);
    expect((await request("GET", path, { token })).status).toBe(404);
  });

  test("returns 400 VALIDATION for an empty title or a non-numeric id", async () => {
    const { app, request } = createTestApp();
    const token = await signUp(app);

    const emptyTitle = await request("POST", "/notes", { token, body: { title: "" } });
    expect(emptyTitle.status).toBe(400);
    expect(emptyTitle.body.error.code).toBe("VALIDATION");
    expect((await request("GET", "/notes/abc", { token })).status).toBe(400);
  });

  test("another user's note is 404, not 403", async () => {
    const { app, request } = createTestApp();
    const alice = await signUp(app, "alice@example.com");
    const bob = await signUp(app, "bob@example.com");

    const note = await request("POST", "/notes", { token: alice, body: { title: "Private" } });
    const res = await request("GET", `/notes/${note.body.id}`, { token: bob });
    expect(res.status).toBe(404);
  });
});
```

## 3. Mount it in `src/app.ts`

```ts edit=src/app.ts
import { createNotesRepository } from "./modules/notes/notes.repository";
import { notesRoutes } from "./modules/notes/notes.routes";
import { createNotesService } from "./modules/notes/notes.service";

// inside createApp(), next to the users service:
const notes = createNotesService(createNotesRepository(db));

// at the end of the chain:
    .use(notesRoutes({ notes, tokens }));
```

Then run `bun run format` and `bun run verify`.
