# Rebuilding a SQLite table

Use this when a change can't be made with `ADD COLUMN` or `RENAME COLUMN`: dropping a column,
changing a type, or adding a constraint. This example adds a length `CHECK` to `notes.title` (the
table from the add-model example):

```ts
{
  id: "0003_rebuild_notes_limit_title",
  disableForeignKeys: true, // required: DROP TABLE with foreign keys on deletes child rows
  sql: `
    CREATE TABLE notes_new (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT    NOT NULL CHECK (length(title) <= 200),
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    INSERT INTO notes_new (id, user_id, title, created_at)
      SELECT id, user_id, substr(title, 1, 200), created_at FROM notes;
    DROP TABLE notes;
    ALTER TABLE notes_new RENAME TO notes;
    CREATE INDEX notes_user_id ON notes (user_id);
  `,
},
```

Rules:

1. Copy every row with an explicit column list. Transform values so they satisfy the new constraints
   (here, `substr` for the new length limit).
2. Recreate the table's indexes and triggers after the rename. `DROP TABLE` removes them.
3. `migrate()` runs `PRAGMA foreign_key_check` before committing and rolls back if any reference
   dangles. See the test `a rebuild that leaves dangling references is rolled back` in
   `src/db/migrations.test.ts`.
4. Add a test in `src/db/migrations.test.ts` that seeds rows, runs the migration, and checks that both
   the rebuilt table's rows and any child rows survived.
