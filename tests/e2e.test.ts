import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { TEMPLATES } from "../src/manifest";
import { assertResultSchema, runCli, tempDir } from "./helpers";

test("creates a project that installs from its lockfile, commits, and passes its own verify", async () => {
  const cwd = tempDir();
  const r = await runCli(["my-api", "--json"], { cwd, timeoutMs: 180_000 });
  if (r.code !== 0) console.error(r.stdout, r.stderr);

  expect(r.code).toBe(0);
  assertResultSchema(r.json);
  const statuses = Object.fromEntries(
    r.json.steps.map((s: { id: string; status: string }) => [s.id, s.status]),
  );
  expect(statuses).toEqual({ plan: "ok", write: "ok", install: "ok", git: "ok", verify: "ok" });

  const dir = join(cwd, "my-api");
  const read = (path: string) => readFileSync(join(dir, path), "utf8");

  expect(JSON.parse(read("package.json")).name).toBe("my-api");
  expect(read("AGENTS.md").split("\n")[0]).toBe("# my-api");
  expect(read("CLAUDE.md").trim()).toBe("@AGENTS.md");

  // .env holds a real secret and must never be committed.
  expect(read(".env")).toMatch(/^JWT_SECRET=[0-9a-f]{64}$/m);
  expect((await $`git check-ignore .env`.cwd(dir).nothrow()).exitCode).toBe(0);
  const tracked = (await $`git ls-files`.cwd(dir).text()).split("\n");
  expect(tracked).not.toContain(".env");
  expect(tracked.some((p) => p.startsWith("node_modules/"))).toBe(false);

  const placeholder = TEMPLATES[0]?.placeholder ?? "";
  const leftovers = await $`grep -rl --exclude-dir=node_modules --exclude-dir=.git ${placeholder} .`
    .cwd(dir)
    .nothrow()
    .text();
  expect(leftovers.trim()).toBe("");
}, 180_000);
