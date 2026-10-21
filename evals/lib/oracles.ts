import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ROOT } from "../../src/manifest";

/**
 * Known-good scripted solutions for eval tasks. They prove the harness and acceptance tests work
 * without spending agent credits, and they keep skill reference code honest.
 * Every edit must apply; a template change that breaks one fails loudly.
 */

function edit(dir: string, path: string, edits: [from: string, to: string][]) {
  const file = join(dir, path);
  let text = readFileSync(file, "utf8");
  for (const [from, to] of edits) {
    if (!text.includes(from))
      throw new Error(`oracle edit no longer applies to ${path}: ${from.slice(0, 70)}`);
    text = text.split(from).join(to);
  }
  writeFileSync(file, text);
}

export function codeBlocks(markdown: string, attr: "file" | "edit") {
  return [
    ...markdown.matchAll(new RegExp(`\`\`\`ts ${attr}=(\\S+)\\n([\\s\\S]*?)\\n\`\`\``, "g")),
  ].map(([, path, code]) => ({ path: path ?? "", code: code ?? "" }));
}

const appendMigration = (dir: string, migration: string) =>
  edit(dir, "src/db/migrations.ts", [["\n];\n", `\n${migration}\n];\n`]]);

/** Applies skills/add-endpoint/references/notes-module.md the way an agent following it would. */
export function applyNotesExample(dir: string): { appEditLines: string[] } {
  const doc = readFileSync(join(ROOT, "skills/add-endpoint/references/notes-module.md"), "utf8");
  const files = codeBlocks(doc, "file");
  if (files.length !== 5)
    throw new Error(`expected 5 files in notes-module.md, found ${files.length}`);
  for (const { path, code } of files) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), `${code}\n`);
  }

  const edits = Object.fromEntries(codeBlocks(doc, "edit").map((e) => [e.path, e.code]));
  appendMigration(dir, edits["src/db/migrations.ts"] ?? "");
  edit(dir, "src/app.ts", [
    [
      "import { createUsersRepository }",
      [
        'import { createNotesRepository } from "./modules/notes/notes.repository";',
        'import { notesRoutes } from "./modules/notes/notes.routes";',
        'import { createNotesService } from "./modules/notes/notes.service";',
        "import { createUsersRepository }",
      ].join("\n"),
    ],
    [
      "  const ping =",
      "  const notes = createNotesService(createNotesRepository(db));\n  const ping =",
    ],
    [
      "    .use(usersRoutes({ users, tokens }));",
      "    .use(usersRoutes({ users, tokens }))\n    .use(notesRoutes({ notes, tokens }));",
    ],
  ]);

  const appEditLines = (edits["src/app.ts"] ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"));
  return { appEditLines };
}

/** Adds an optional `bio` (≤500 chars) to users, following the add-model skill. */
export function applyBioExample(dir: string) {
  appendMigration(
    dir,
    '  {\n    id: "0002_add_users_bio",\n    sql: "ALTER TABLE users ADD COLUMN bio TEXT;",\n  },',
  );
  const users = "src/modules/users";
  edit(dir, `${users}/users.schema.ts`, [
    [
      "  name: t.Union([t.String(), t.Null()]),\n  createdAt",
      "  name: t.Union([t.String(), t.Null()]),\n  bio: t.Union([t.String(), t.Null()]),\n  createdAt",
    ],
    [
      "  name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),\n});",
      "  name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),\n  bio: t.Optional(t.String({ maxLength: 500 })),\n});",
    ],
  ]);
  edit(dir, `${users}/users.repository.ts`, [
    [
      "  name: string | null;\n  password_hash",
      "  name: string | null;\n  bio: string | null;\n  password_hash",
    ],
    ["  name: row.name,\n  createdAt", "  name: row.name,\n  bio: row.bio,\n  createdAt"],
    [
      "{ email: string; name: string | null; passwordHash: string }",
      "{ email: string; name: string | null; bio: string | null; passwordHash: string }",
    ],
    [
      "INSERT INTO users (email, name, password_hash) VALUES ($email, $name, $passwordHash)",
      "INSERT INTO users (email, name, bio, password_hash) VALUES ($email, $name, $bio, $passwordHash)",
    ],
  ]);
  edit(dir, `${users}/users.service.ts`, [
    [
      "name: input.name ?? null, passwordHash",
      "name: input.name ?? null, bio: input.bio ?? null, passwordHash",
    ],
  ]);
}
