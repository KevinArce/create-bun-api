import { expect, test } from "bun:test";
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { EXIT, ROOT } from "../src/manifest";
import { assertResultSchema, runCli, tempDir } from "./helpers";

// Each test injects one failure and checks the run fails honestly: the right exit code,
// an error code and hint, and no half-written project (audit E4/E5: the old tool exited 0).

test("unreachable registry → INSTALL_FAILED (exit 5) and nothing left on disk", async () => {
  const cwd = tempDir();
  const r = await runCli(["my-api", "--json", "--no-git"], {
    cwd,
    env: {
      BUN_CONFIG_REGISTRY: "http://127.0.0.1:9/",
      BUN_INSTALL_CACHE_DIR: tempDir("bun-api-empty-cache-"),
    },
    timeoutMs: 120_000,
  });

  expect(r.code).toBe(EXIT.install);
  expect(r.json.error.code).toBe("INSTALL_FAILED");
  expect(r.json.error.hint).toContain("--no-install");
  expect(r.json.error.details.output).toBeString();
  expect(readdirSync(cwd)).toEqual([]);
  assertResultSchema(r.json);
}, 120_000);

test("git not installed → warning, project still created (exit 0)", async () => {
  const cwd = tempDir();
  const r = await runCli(["my-api", "--json", "--no-install"], {
    cwd,
    env: { PATH: "/nonexistent" },
  });

  expect(r.code).toBe(0);
  expect(r.json.steps.find((s: { id: string }) => s.id === "git")).toMatchObject({
    status: "skipped",
    detail: "git not found",
  });
  expect(r.json.warnings.join(" ")).toContain("git is not installed");
  expect(existsSync(join(cwd, "my-api", "package.json"))).toBe(true);
});

test("inside an existing git repository → no nested repository", async () => {
  const cwd = tempDir();
  await Bun.spawn(["git", "init", "-q"], { cwd }).exited;
  const r = await runCli(["my-api", "--json", "--no-install"], { cwd });

  expect(r.code).toBe(0);
  expect(r.json.steps.find((s: { id: string }) => s.id === "git")).toMatchObject({
    status: "skipped",
    detail: "already inside a git repository",
  });
  expect(existsSync(join(cwd, "my-api", ".git"))).toBe(false);
});

test("template whose tests fail → VERIFY_FAILED (exit 6), project kept for inspection", async () => {
  const templates = tempDir("bun-api-templates-");
  cpSync(join(ROOT, "templates", "api"), join(templates, "api"), {
    recursive: true,
    filter: (src) => !src.includes("node_modules"),
  });
  appendFileSync(
    join(templates, "api", "test", "app.test.ts"),
    '\ntest("deliberately broken", () => {\n  expect(1).toBe(2);\n});\n',
  );

  const cwd = tempDir();
  const r = await runCli(["my-api", "--json", "--no-git"], {
    cwd,
    env: { BUN_API_TEMPLATES_DIR: templates },
    timeoutMs: 120_000,
  });

  expect(r.code).toBe(EXIT.verify);
  expect(r.json.error.code).toBe("VERIFY_FAILED");
  expect(r.json.error.details.failed.map((s: { id: string }) => s.id)).toEqual(["test"]);
  expect(r.json.error.details.failed[0].output).toContain("deliberately broken");
  expect(existsSync(join(cwd, "my-api", "package.json"))).toBe(true);
  assertResultSchema(r.json);
}, 120_000);

test("read-only parent directory → WRITE_FAILED (exit 1)", async () => {
  const cwd = tempDir();
  const readOnly = join(cwd, "ro");
  mkdirSync(readOnly);
  chmodSync(readOnly, 0o555);
  try {
    const r = await runCli(["ro/my-api", "--json", "--no-install"], { cwd });
    expect(r.code).toBe(EXIT.internal);
    expect(r.json.error.code).toBe("WRITE_FAILED");
    assertResultSchema(r.json);
  } finally {
    chmodSync(readOnly, 0o755);
  }
});
