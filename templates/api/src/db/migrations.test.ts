import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { type Migration, migrate, migrations } from "./migrations";

const freshDb = () => {
  const db = new Database(":memory:", { strict: true });
  db.run("PRAGMA foreign_keys = ON");
  return db;
};

test("applies every migration once, and is a no-op on rerun", () => {
  const db = freshDb();
  expect(migrate(db)).toEqual(migrations.map((m) => m.id));
  expect(migrate(db)).toEqual([]);
});

test("migration ids are unique and ordered", () => {
  const ids = migrations.map((m) => m.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect([...ids].sort()).toEqual(ids);
});

const parentChild: Migration[] = [
  {
    id: "a_parent_child",
    sql: `
      CREATE TABLE parents (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE children (id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE);
      INSERT INTO parents (id, name) VALUES (1, 'p');
      INSERT INTO children (id, parent_id) VALUES (10, 1);
    `,
  },
];

const rebuildParents = `
  CREATE TABLE parents_new (id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT '');
  INSERT INTO parents_new (id, name) SELECT id, COALESCE(name, '') FROM parents;
  DROP TABLE parents;
  ALTER TABLE parents_new RENAME TO parents;
`;

test("a table rebuild with disableForeignKeys keeps child rows", () => {
  const db = freshDb();
  migrate(db, [...parentChild, { id: "b_rebuild", sql: rebuildParents, disableForeignKeys: true }]);

  expect(db.query("SELECT COUNT(*) AS n FROM children").get()).toEqual({ n: 1 });
  expect(db.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
});

test("without the flag, the same rebuild silently deletes child rows (why the flag exists)", () => {
  const db = freshDb();
  migrate(db, [...parentChild, { id: "b_rebuild", sql: rebuildParents }]);

  expect(db.query("SELECT COUNT(*) AS n FROM children").get()).toEqual({ n: 0 });
});

test("a rebuild that leaves dangling references is rolled back", () => {
  const db = freshDb();
  const dropParents: Migration = {
    id: "b_bad",
    sql: "DELETE FROM parents;",
    disableForeignKeys: true,
  };

  expect(() => migrate(db, [...parentChild, dropParents])).toThrow("broke foreign keys");
  expect(db.query("SELECT COUNT(*) AS n FROM parents").get()).toEqual({ n: 1 });
  expect(db.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
});
