import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { applyNotesExample } from "../evals/lib/oracles";
import { ROOT, TEMPLATES } from "../src/manifest";
import { migrate, migrations } from "../templates/api/src/db/migrations";
import { runCli, tempDir } from "./helpers";

const SKILLS = join(ROOT, "skills");
const skillIds = readdirSync(SKILLS).filter((d) => existsSync(join(SKILLS, d, "SKILL.md")));
const SPEC_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

function frontmatter(text: string): Record<string, string> {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match?.[1]) throw new Error("missing frontmatter");
  return Object.fromEntries(
    match[1].split("\n").map((line) => {
      const i = line.indexOf(":");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
  );
}

describe.each(skillIds)("skill %s follows the Agent Skills spec", (id) => {
  const text = readFileSync(join(SKILLS, id, "SKILL.md"), "utf8");
  const meta = frontmatter(text);

  test("name: lowercase-hyphenated, at most 64 chars, equal to its directory", () => {
    expect(meta.name).toBe(id);
    expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(id.length).toBeLessThanOrEqual(64);
  });

  test("description: 1 to 1024 chars, says when to use it", () => {
    expect(meta.description?.length ?? 0).toBeGreaterThan(0);
    expect(meta.description?.length ?? 0).toBeLessThanOrEqual(1024);
    expect(meta.description).toContain("Use when");
  });

  test("only spec frontmatter fields (portable across agents)", () => {
    for (const key of Object.keys(meta)) expect(SPEC_FIELDS.has(key)).toBe(true);
  });

  test("SKILL.md stays under 500 lines and every relative link exists", () => {
    expect(text.split("\n").length).toBeLessThan(500);
    for (const [, link] of text.matchAll(/\]\(((?!https?:)[^)#]+)\)/g)) {
      expect(existsSync(join(SKILLS, id, link ?? ""))).toBe(true);
    }
  });
});

test("every skill a template installs exists", () => {
  for (const t of TEMPLATES) for (const s of t.skills) expect(skillIds).toContain(s);
});

test("AGENTS.md files stay short (≤150 lines)", () => {
  for (const path of ["AGENTS.md", "templates/api/AGENTS.md"]) {
    expect(readFileSync(join(ROOT, path), "utf8").split("\n").length).toBeLessThanOrEqual(150);
  }
});

test("add-endpoint's notes example, applied to a new project, passes verify", async () => {
  const cwd = tempDir();
  const created = await runCli(["my-api", "--json", "--no-git", "--no-verify"], {
    cwd,
    timeoutMs: 120_000,
  });
  expect(created.code).toBe(0);
  const dir = join(cwd, "my-api");

  // Same code path the eval oracle uses: write the 5 documented files, apply the 2 documented edits.
  const { appEditLines } = applyNotesExample(dir);
  const app = readFileSync(join(dir, "src/app.ts"), "utf8");
  for (const line of appEditLines) expect(app).toContain(line);

  await Bun.spawn([process.execPath, "run", "format"], {
    cwd: dir,
    stdout: "ignore",
    stderr: "ignore",
  }).exited;
  const verify = Bun.spawn([process.execPath, "run", "verify", "--json"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const report = JSON.parse(await new Response(verify.stdout).text());
  if (!report.ok) console.error(JSON.stringify(report, null, 2));
  expect(report.ok).toBe(true);
}, 180_000);

test("add-model's create and rebuild examples run and keep child rows", () => {
  const sqlOf = (markdown: string) => {
    const match = markdown.match(/sql: `([\s\S]*?)`/);
    if (!match?.[1]) throw new Error("no sql block");
    return match[1];
  };
  const create = sqlOf(readFileSync(join(SKILLS, "add-model", "SKILL.md"), "utf8"));
  const rebuild = sqlOf(
    readFileSync(join(SKILLS, "add-model", "references", "table-rebuild.md"), "utf8"),
  );

  const db = new Database(":memory:", { strict: true });
  db.run("PRAGMA foreign_keys = ON");
  migrate(db, [...migrations, { id: "0002_create_notes", sql: create }]);
  db.run("INSERT INTO users (email, password_hash) VALUES ('a@b.dev', 'x')");
  db.run(`INSERT INTO notes (user_id, title) VALUES (1, '${"t".repeat(250)}')`);

  migrate(db, [
    ...migrations,
    { id: "0002_create_notes", sql: create },
    { id: "0003_rebuild_notes_limit_title", sql: rebuild, disableForeignKeys: true },
  ]);

  expect(db.query("SELECT length(title) AS n FROM notes").get()).toEqual({ n: 200 });
  expect(() =>
    db.run(`INSERT INTO notes (user_id, title) VALUES (1, '${"t".repeat(201)}')`),
  ).toThrow();
  expect(db.query("PRAGMA index_list(notes)").all()).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "notes_user_id" })]),
  );
});
