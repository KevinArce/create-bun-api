import type { Database } from "bun:sqlite";

export type Migration = {
  id: string;
  sql: string;
  /**
   * Set only for table rebuilds (create new → copy → DROP old → rename). With foreign keys on,
   * DROP TABLE cascades and deletes child rows. This turns them off for the migration and
   * checks integrity before commit.
   */
  disableForeignKeys?: boolean;
};

/**
 * Append-only list of schema changes, applied in order at startup.
 * Never edit or reorder a migration that has shipped; add a new one instead.
 */
export const migrations: readonly Migration[] = [
  {
    id: "0001_create_users",
    sql: `
      CREATE TABLE users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        name          TEXT,
        password_hash TEXT    NOT NULL,
        created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `,
  },
];

export function migrate(db: Database, list: readonly Migration[] = migrations): string[] {
  db.run(`CREATE TABLE IF NOT EXISTS _migrations (
    id         TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);

  const applied = new Set(
    db
      .query<{ id: string }, []>("SELECT id FROM _migrations")
      .all()
      .map((row) => row.id),
  );
  const record = db.query<unknown, { id: string }>("INSERT INTO _migrations (id) VALUES ($id)");

  const ran: string[] = [];
  for (const migration of list) {
    if (applied.has(migration.id)) continue;
    // PRAGMA foreign_keys is ignored inside a transaction, so toggle it outside.
    if (migration.disableForeignKeys) db.run("PRAGMA foreign_keys = OFF");
    try {
      db.transaction(() => {
        db.run(migration.sql);
        if (migration.disableForeignKeys) {
          const violations = db.query("PRAGMA foreign_key_check").all();
          if (violations.length > 0) {
            throw new Error(
              `Migration ${migration.id} broke foreign keys: ${JSON.stringify(violations.slice(0, 5))}`,
            );
          }
        }
        record.run({ id: migration.id });
      })();
    } finally {
      if (migration.disableForeignKeys) db.run("PRAGMA foreign_keys = ON");
    }
    ran.push(migration.id);
  }
  return ran;
}
