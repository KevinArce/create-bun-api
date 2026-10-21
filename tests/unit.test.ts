import { describe, expect, test } from "bun:test";
import resultSchema from "../schemas/result.v1.json";
import { suggestProjectName, validateProjectName } from "../src/engine/name";
import { planFiles } from "../src/engine/template";
import { compareVersions } from "../src/engine/version";
import { ERROR_CODES, TEMPLATES, VERSION } from "../src/manifest";

describe("validateProjectName", () => {
  test.each(["my-api", "api2", "a", "my.api", "my_api", "0day"])("accepts %p", (name) => {
    expect(validateProjectName(name)).toBeNull();
  });

  test.each([
    "",
    ".",
    "..",
    "-x",
    "--help",
    "_private",
    "My Project",
    "UPPER",
    "a/b",
    "node_modules",
  ])("rejects %p", (name) => {
    expect(validateProjectName(name)).toBeString();
  });

  test("suggests a valid name", () => {
    expect(suggestProjectName("My Cool Project!")).toBe("my-cool-project");
    expect(validateProjectName(suggestProjectName("--Weird__Name--"))).toBeNull();
  });
});

test("compareVersions", () => {
  expect(compareVersions("1.4.2", "1.4.0")).toBe(1);
  expect(compareVersions("1.3.9", "1.4.0")).toBe(-1);
  expect(compareVersions("1.4.0-canary.1", "1.4.0")).toBe(0);
  expect(compareVersions("2", "1.99.99")).toBe(1);
});

describe("planFiles", () => {
  const spec =
    TEMPLATES[0] ??
    (() => {
      throw new Error("no templates");
    })();
  const files = planFiles(spec, "my-api");
  const paths = files.map((f) => f.path);
  const text = (path: string) => {
    const file = files.find((f) => f.path === path);
    if (!file) throw new Error(`missing ${path}`);
    return typeof file.content === "string" ? file.content : Buffer.from(file.content).toString();
  };

  test("never copies dependencies, local env files, or data", () => {
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
    expect(paths.some((p) => p.startsWith("data/"))).toBe(false);
  });

  test("renames gitignore to .gitignore, which ignores .env", () => {
    expect(paths).toContain(".gitignore");
    expect(paths).not.toContain("gitignore");
    expect(text(".gitignore")).toMatch(/^\.env$/m);
  });

  test("replaces the placeholder everywhere it is declared", () => {
    for (const path of spec.substituteIn) {
      expect(text(path)).not.toContain(spec.placeholder);
      expect(text(path)).toContain("my-api");
    }
  });

  test("writes a .env with a fresh 64-hex-char JWT_SECRET", () => {
    expect(text(".env")).toMatch(/^JWT_SECRET=[0-9a-f]{64}$/m);
    const again = planFiles(spec, "my-api").find((f) => f.path === ".env");
    expect(String(again?.content)).not.toBe(text(".env"));
  });

  test("copies each skill for Codex (.agents) and Claude Code (.claude)", () => {
    for (const skill of spec.skills) {
      expect(paths).toContain(`.agents/skills/${skill}/SKILL.md`);
      expect(paths).toContain(`.claude/skills/${skill}/SKILL.md`);
    }
  });

  test("writes provenance", () => {
    expect(JSON.parse(text("create-bun-api.json"))).toEqual({
      generator: "create-bun-api",
      generatorVersion: VERSION,
      template: "api",
      templateVersion: expect.any(String),
    });
  });

  test("is deterministic apart from .env", () => {
    const strip = (fs: typeof files) =>
      fs
        .filter((f) => f.path !== ".env")
        .map((f) => [f.path, Buffer.from(f.content).toString("base64")]);
    expect(strip(planFiles(spec, "my-api"))).toEqual(strip(files));
  });
});

test("the result schema lists exactly the manifest's error codes", () => {
  expect(resultSchema.properties.error.properties.code.enum.sort()).toEqual(
    Object.keys(ERROR_CODES).sort(),
  );
});
