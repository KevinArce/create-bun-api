import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../src/manifest";
import { applyBioExample, applyNotesExample } from "./lib/oracles";

export type Arm = "toolkit" | "baseline";

export type Task = {
  id: string;
  /** Exactly what the agent is told. Identical for both arms. */
  prompt: string;
  acceptance: string;
  /** Where the agent starts, relative to the run root. The project is always at <root>/app. */
  agentCwd: "root" | "app";
  /** Builds the starting state for an arm. Returns extra PATH entries for the agent. */
  prepare(root: string, arm: Arm): Promise<string[]>;
  oracle(root: string): Promise<void>;
};

const cli = (args: string[], cwd: string) => {
  const r = Bun.spawnSync([process.execPath, join(ROOT, "src/cli.ts"), ...args], { cwd });
  if (r.exitCode !== 0)
    throw new Error(`create-bun-api ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
};
const git = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", ...args], { cwd });

/** Pre-publish stand-in: a create-bun-api command on PATH that runs this checkout. */
function installCliShim(root: string): string {
  const bin = join(root, ".bin");
  mkdirSync(bin, { recursive: true });
  const shim = join(bin, "create-bun-api");
  writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${join(ROOT, "src/cli.ts")}" "$@"\n`);
  Bun.spawnSync(["chmod", "+x", shim]);
  return bin;
}

/** Installs a toolkit skill for Claude Code and Codex, pointing it at the local shim. */
function installSkill(root: string, id: string) {
  for (const dir of [".claude/skills", ".agents/skills"]) {
    const target = join(root, dir, id);
    cpSync(join(ROOT, "skills", id), target, { recursive: true });
    const skill = join(target, "SKILL.md");
    writeFileSync(
      skill,
      readFileSync(skill, "utf8")
        .replaceAll("bunx create-bun-api", "create-bun-api")
        .replaceAll("bun create bun-api", "create-bun-api"),
    );
  }
}

/** A generated project with a clean first commit. Baseline strips the agent-facing layer only. */
function generatedProject(root: string, arm: Arm) {
  cli(["app", "--yes", "--json", "--no-git", "--no-verify"], root);
  const app = join(root, "app");
  if (arm === "baseline") {
    for (const p of ["AGENTS.md", "CLAUDE.md", ".agents", ".claude"]) {
      rmSync(join(app, p), { recursive: true, force: true });
    }
  }
  git(app, "init", "-q");
  git(app, "add", "-A");
  git(app, "-c", "user.name=eval", "-c", "user.email=eval@example.com", "commit", "-qm", "start");
}

const finish = (app: string) => {
  Bun.spawnSync([process.execPath, "run", "format"], { cwd: app });
};

export const TASKS: Task[] = [
  {
    id: "create-auth-api",
    acceptance: "evals/acceptance/auth-api.test.ts",
    agentCwd: "root",
    prompt: `Create a new HTTP API with Bun and TypeScript in a new directory named \`app\`.
Requirements:
- From inside app/, \`bun install\` then \`bun run start\` starts the server. It listens on the PORT environment variable and reads its JWT signing secret from JWT_SECRET.
- POST /auth/register with JSON {email, password} creates a user and returns 201. An invalid email or a password shorter than 8 characters returns 400. A duplicate email returns 409.
- POST /auth/login with {email, password} returns 200 and JSON containing \`token\`. Wrong credentials return 401.
- GET /users/me with \`Authorization: Bearer <token>\` returns 200 and JSON containing \`email\`. A missing or invalid token returns 401.
- Store data in SQLite. Never return password hashes.
Make sure it works before you finish.`,
    async prepare(root, arm) {
      if (arm === "baseline") return [];
      installSkill(root, "create-bun-api");
      return [installCliShim(root)];
    },
    async oracle(root) {
      cli(["app", "--yes", "--json", "--no-git"], root);
    },
  },
  {
    id: "add-notes",
    acceptance: "evals/acceptance/notes.test.ts",
    agentCwd: "app",
    prompt: `Add notes to this API. Authenticated users can:
- POST /notes with JSON {title, body?} → 201 with JSON containing \`id\` and \`title\`. title is required, 1 to 200 characters; otherwise 400.
- GET /notes → 200 with a JSON array of only their own notes.
- GET /notes/:id → 200 with the note.
- DELETE /notes/:id → 204.
Another user's note must return 404 for GET and DELETE. Every notes route returns 401 without a valid bearer token.
Make sure it works before you finish.`,
    async prepare(root, arm) {
      generatedProject(root, arm);
      return [];
    },
    async oracle(root) {
      applyNotesExample(join(root, "app"));
      finish(join(root, "app"));
    },
  },
  {
    id: "add-user-bio",
    acceptance: "evals/acceptance/bio.test.ts",
    agentCwd: "app",
    prompt: `Users should have an optional bio of at most 500 characters.
- POST /auth/register accepts an optional \`bio\`. A longer bio returns 400.
- GET /users/me includes \`bio\` (null when not set).
Existing behavior must keep working. Make sure it works before you finish.`,
    async prepare(root, arm) {
      generatedProject(root, arm);
      return [];
    },
    async oracle(root) {
      applyBioExample(join(root, "app"));
      finish(join(root, "app"));
    },
  },
];
