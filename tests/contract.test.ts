import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COMMANDS, ERROR_CODES, EXIT, VERSION } from "../src/manifest";
import { assertResultSchema, runCli, tempDir } from "./helpers";

describe("discovery", () => {
  test("--help prints usage and exits 0 (audit E1: flags used to be ignored)", async () => {
    const r = await runCli(["--help"], { stdin: "open" });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Usage:");
  });

  test.each(COMMANDS.map((c) => c.name))("%s --help lists every flag", async (name) => {
    const r = await runCli([name, "--help"]);
    expect(r.code).toBe(0);
    for (const flag of COMMANDS.find((c) => c.name === name)?.flags ?? []) {
      expect(r.stdout).toContain(`--${flag.name}`);
    }
  });

  test("--version prints the version", async () => {
    const r = await runCli(["--version"], { stdin: "open" });
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(VERSION);
  });

  test("describe prints JSON that mirrors the manifest", async () => {
    const r = await runCli(["describe"]);
    expect(r.code).toBe(0);
    expect(r.json.schema).toBe("bun-api/describe@1");
    expect(r.json.commands.map((c: { name: string }) => c.name)).toEqual(
      COMMANDS.map((c) => c.name),
    );
    expect(r.json.exitCodes).toEqual(EXIT);
    expect(Object.keys(r.json.errorCodes)).toEqual(Object.keys(ERROR_CODES));
  });
});

describe("never blocks (audit E2: hung forever on open stdin)", () => {
  test("missing directory with open, silent stdin exits 2 at once (--json)", async () => {
    const r = await runCli(["--json"], { stdin: "open", timeoutMs: 10_000 });
    expect(r.code).toBe(EXIT.usage);
    expect(r.json.error.code).toBe("USAGE");
    expect(r.ms).toBeLessThan(5000);
    assertResultSchema(r.json);
  });

  test("missing directory with open, silent stdin exits 2 at once (human)", async () => {
    const r = await runCli([], { stdin: "open", timeoutMs: 10_000 });
    expect(r.code).toBe(EXIT.usage);
    expect(r.stderr).toContain("USAGE");
    expect(r.stderr).toContain("fix:");
  });
});

describe("usage errors carry a code and a hint", () => {
  test("unknown flag", async () => {
    const r = await runCli(["my-api", "--frobnicate", "--json"]);
    expect(r.code).toBe(EXIT.usage);
    expect(r.json.error).toMatchObject({ code: "USAGE", hint: expect.stringContaining("--help") });
  });

  test("more than one directory", async () => {
    const r = await runCli(["a", "b", "--json"]);
    expect(r.code).toBe(EXIT.usage);
    expect(r.json.error.code).toBe("USAGE");
  });

  test.each([
    ["My Project", "my-project"],
    ["UPPER", "upper"],
    ["-x", "x"],
  ])("invalid name %p suggests %p (audit E6)", async (name, suggestion) => {
    const cwd = tempDir();
    const r = await runCli(["--json", "--", name], { cwd });
    expect(r.code).toBe(EXIT.usage);
    expect(r.json.error.code).toBe("INVALID_NAME");
    expect(r.json.error.hint).toContain(suggestion);
    assertResultSchema(r.json);
  });

  test("unknown template", async () => {
    const r = await runCli(["my-api", "--template", "nope", "--json"]);
    expect(r.code).toBe(EXIT.usage);
    expect(r.json.error.code).toBe("UNKNOWN_TEMPLATE");
  });
});

describe("target safety", () => {
  test("refuses a non-empty directory and changes nothing", async () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, "my-api"));
    writeFileSync(join(cwd, "my-api", "keep.txt"), "mine");

    const r = await runCli(["my-api", "--json", "--no-install"], { cwd });
    expect(r.code).toBe(EXIT.conflict);
    expect(r.json.error.code).toBe("TARGET_EXISTS");
    expect(readdirSync(join(cwd, "my-api"))).toEqual(["keep.txt"]);
    expect(readdirSync(cwd)).toEqual(["my-api"]);
  });

  test("fills an existing empty directory", async () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, "my-api"));
    const r = await runCli(["my-api", "--json", "--no-install", "--no-git"], { cwd });
    expect(r.code).toBe(0);
    expect(existsSync(join(cwd, "my-api", "AGENTS.md"))).toBe(true);
    expect(readdirSync(cwd)).toEqual(["my-api"]);
  });

  test("creates missing parent directories and names the project after the last segment", async () => {
    const cwd = tempDir();
    const r = await runCli(["services/billing", "--json", "--no-install", "--no-git"], { cwd });
    expect(r.code).toBe(0);
    expect(r.json.project.name).toBe("billing");
    expect(existsSync(join(cwd, "services", "billing", "package.json"))).toBe(true);
  });
});

test("--dry-run lists files and writes nothing", async () => {
  const cwd = tempDir();
  const r = await runCli(["my-api", "--dry-run", "--json"], { cwd });
  expect(r.code).toBe(0);
  assertResultSchema(r.json);
  expect(r.json.dryRun).toBe(true);
  expect(r.json.files).toEqual(
    expect.arrayContaining(["AGENTS.md", "CLAUDE.md", ".gitignore", ".env"]),
  );
  expect(readdirSync(cwd)).toEqual([]);
});

test("--json prints exactly one JSON object and nothing on stderr", async () => {
  const cwd = tempDir();
  const r = await runCli(["my-api", "--json", "--no-install", "--no-git"], { cwd });
  expect(r.code).toBe(0);
  expect(r.stderr).toBe("");
  assertResultSchema(r.json);
  expect(r.json.steps.map((s: { id: string; status: string }) => [s.id, s.status])).toEqual([
    ["plan", "ok"],
    ["write", "ok"],
    ["install", "skipped"],
    ["git", "skipped"],
    ["verify", "skipped"],
  ]);
  expect(r.json.next).toEqual(["cd my-api", "bun install", "bun run dev"]);
});

test("doctor --json reports every check and matches the schema", async () => {
  const r = await runCli(["doctor", "--json"]);
  expect([0, EXIT.prerequisite]).toContain(r.code ?? -1);
  assertResultSchema(r.json);
  expect(r.json.checks.map((c: { id: string }) => c.id)).toEqual([
    "bun",
    "git",
    "registry",
    "write",
  ]);
});
