import { expect, test } from "bun:test";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { ROOT, TEMPLATES } from "../src/manifest";
import { tempDir } from "./helpers";

// The release workflow publishes exactly this tarball, so this is the artifact users get.
test("the packed tarball contains what users need and works when installed", async () => {
  const out = tempDir("bun-api-pack-");
  const pack = Bun.spawnSync([process.execPath, "pm", "pack", "--destination", out], { cwd: ROOT });
  expect(pack.exitCode).toBe(0);
  const tarball = readdirSync(out).find((f) => f.endsWith(".tgz"));
  if (!tarball) throw new Error("bun pm pack produced no tarball");

  const listing = await $`tar tzf ${join(out, tarball)}`.text();
  const files = listing
    .trim()
    .split("\n")
    .map((p) => p.replace(/^package\//, ""));

  const skills = TEMPLATES.flatMap((t) => t.skills).concat("create-bun-api");
  for (const required of [
    "package.json",
    "README.md",
    "CHANGELOG.md",
    "LICENSE-MIT",
    "LICENSE-APACHE",
    "src/cli.ts",
    "schemas/result.v1.json",
    "templates/api/package.json",
    "templates/api/bun.lock",
    "templates/api/gitignore",
    ...skills.map((s) => `skills/${s}/SKILL.md`),
  ]) {
    expect(files).toContain(required);
  }
  const unwanted = files.filter(
    (p) =>
      /(^|\/)(node_modules|\.github)\//.test(p) ||
      /^(tests|evals|docs|scripts)\//.test(p) ||
      /(^|\/)\.env$/.test(p) ||
      p.endsWith(".sqlite"),
  );
  expect(unwanted).toEqual([]);

  const consumer = tempDir("bun-api-consumer-");
  writeFileSync(join(consumer, "package.json"), '{ "name": "consumer", "private": true }\n');
  const add = Bun.spawnSync([process.execPath, "add", join(out, tarball)], { cwd: consumer });
  expect(add.exitCode).toBe(0);

  const run = Bun.spawnSync(
    [process.execPath, "x", "create-bun-api", "my-api", "--json", "--no-git"],
    { cwd: consumer },
  );
  const result = JSON.parse(run.stdout.toString());
  if (!result.ok) console.error(JSON.stringify(result, null, 2));
  expect(result.ok).toBe(true);
  expect(result.steps.find((s: { id: string }) => s.id === "verify")?.status).toBe("ok");
  expect(readFileSync(join(consumer, "my-api", ".gitignore"), "utf8")).toMatch(/^\.env$/m);
}, 180_000);
