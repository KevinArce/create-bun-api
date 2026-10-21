---
name: add-model
description: Add or change a database table in a create-bun-api project (SQLite via bun:sqlite) using an append-only migration and a typed repository. Use when asked to add a model, table, column, index, or relation, or to persist new data.
---

# Add or change a model

1. **Append a migration** to `src/db/migrations.ts` with the next id (`000N_<verb>_<table>`). Never edit,
   reorder, or delete a migration that may already have run somewhere.
2. **SQL conventions:**
   - Ids are `INTEGER PRIMARY KEY AUTOINCREMENT`. Columns are `snake_case`.
   - Timestamps: `TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`.
   - Foreign keys are enforced. Write `REFERENCES users(id) ON DELETE CASCADE` and index every
     foreign key column.
   - Use `COLLATE NOCASE` for case-insensitive unique text such as emails.
   - One migration may contain several statements.

   ```ts
   {
     id: "0002_create_notes",
     sql: `
       CREATE TABLE notes (
         id         INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         title      TEXT    NOT NULL,
         created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       );
       CREATE INDEX notes_user_id ON notes (user_id);
     `,
   },
   ```
3. **Changing an existing table:** `ALTER TABLE … ADD COLUMN` (nullable or with a `DEFAULT`) and
   `ALTER TABLE … RENAME COLUMN` work directly. Dropping a column or changing its type or constraints
   needs a table rebuild. Follow [references/table-rebuild.md](references/table-rebuild.md) exactly:
   without `disableForeignKeys: true`, the rebuild **silently deletes child rows**.
4. **Repository** (`src/modules/<name>/<name>.repository.ts`):
   - Prepare each statement once with `db.query<Row, Params>(sql)`, using `$named` parameters.
     Pass the object **without** the `$` (`{ userId }` for `$userId`). The database runs in strict
     mode and throws on a missing parameter.
   - Map `snake_case` rows to `camelCase` domain objects in one `toX()` function. Never return
     secrets such as password hashes.
   - For unique violations, check `error.code === "SQLITE_CONSTRAINT_UNIQUE"` and return `null`;
     the service then throws `conflict()`.
5. **Test** through the HTTP routes with `createTestApp()`. It gives a fresh in-memory database with
   every migration applied. Add a direct test in `src/db/migrations.test.ts` only for migrations
   that move data.
6. Run `bun run verify`.
