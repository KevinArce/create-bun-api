import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { PACKAGE, skillsRoot, type TemplateSpec, templatesRoot, VERSION } from "../manifest";

/** Never copied from a template directory, at any depth. */
const EXCLUDED = new Set([
  "node_modules",
  ".env",
  "data",
  "logs",
  "coverage",
  "dist",
  ".DS_Store",
  ".git",
]);

export type PlannedFile = { path: string; content: Uint8Array | string };

function walk(dir: string, root = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, root));
    else if (entry.isFile()) out.push(relative(root, full).split(sep).join("/"));
  }
  return out;
}

export function templateDir(spec: TemplateSpec) {
  return join(templatesRoot(), spec.dir);
}

export function templateVersion(spec: TemplateSpec): string {
  const pkg = JSON.parse(readFileSync(join(templateDir(spec), "package.json"), "utf8"));
  return String(pkg.version);
}

const randomHex = (bytes: number) =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("hex");

/**
 * Every file the generated project will contain, in deterministic order.
 * Only `.env` differs between runs (it holds a fresh random JWT_SECRET).
 */
export function planFiles(spec: TemplateSpec, projectName: string): PlannedFile[] {
  const dir = templateDir(spec);
  const files: PlannedFile[] = [];

  for (const path of walk(dir).sort()) {
    const raw = readFileSync(join(dir, path));
    const target = spec.rename[path] ?? path;
    files.push({
      path: target,
      content: spec.substituteIn.includes(path)
        ? raw.toString("utf8").replaceAll(spec.placeholder, projectName)
        : raw,
    });
  }

  const example = files.find((f) => f.path === ".env.example");
  if (example) {
    const text = typeof example.content === "string" ? example.content : example.content.toString();
    files.push({
      path: ".env",
      content: text.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${randomHex(32)}`),
    });
  }

  for (const skill of spec.skills) {
    const skillDir = join(skillsRoot(), skill);
    for (const path of walk(skillDir).sort()) {
      const content = readFileSync(join(skillDir, path));
      files.push({ path: `.agents/skills/${skill}/${path}`, content });
      files.push({ path: `.claude/skills/${skill}/${path}`, content });
    }
  }

  files.push({
    path: `${PACKAGE}.json`,
    content: `${JSON.stringify(
      {
        generator: PACKAGE,
        generatorVersion: VERSION,
        template: spec.id,
        templateVersion: templateVersion(spec),
      },
      null,
      2,
    )}\n`,
  });

  return files.sort((a, b) => a.path.localeCompare(b.path));
}
