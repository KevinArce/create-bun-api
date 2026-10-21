import { fileURLToPath } from "node:url";
import pkg from "../package.json";

/**
 * Single source of truth for the CLI's public contract.
 * `--help`, `describe`, and the docs are all generated from or checked against this file.
 * Changing anything here is an interface change: bump the schema version if you remove or rename.
 */

export const TOOL = "bun-api";
export const PACKAGE = pkg.name;
export const VERSION = pkg.version;
export const MIN_BUN_VERSION = "1.4.0";

export const SCHEMAS = {
  result: "bun-api/result@1",
  describe: "bun-api/describe@1",
} as const;

/** Repo (or installed package) root. */
export const ROOT = fileURLToPath(new URL("../", import.meta.url));

export const EXIT = {
  ok: 0,
  internal: 1,
  usage: 2,
  prerequisite: 3,
  conflict: 4,
  install: 5,
  verify: 6,
} as const;

export const ERROR_CODES = {
  USAGE: { exit: EXIT.usage, description: "Unknown flag, missing argument, or invalid flag value" },
  INVALID_NAME: { exit: EXIT.usage, description: "Directory name is not a valid npm package name" },
  UNKNOWN_TEMPLATE: { exit: EXIT.usage, description: "No template with that id" },
  PREREQUISITE_MISSING: {
    exit: EXIT.prerequisite,
    description: "A required tool is missing or too old (run doctor)",
  },
  TARGET_EXISTS: {
    exit: EXIT.conflict,
    description: "Target exists and is not an empty directory",
  },
  WRITE_FAILED: {
    exit: EXIT.internal,
    description: "Could not write files to the target location",
  },
  INSTALL_FAILED: {
    exit: EXIT.install,
    description: "bun install failed; nothing was left on disk",
  },
  VERIFY_FAILED: {
    exit: EXIT.verify,
    description: "The generated project failed its verify script; it was kept for inspection",
  },
  INTERNAL: { exit: EXIT.internal, description: "Unexpected error (a bug in create-bun-api)" },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export type FlagSpec = {
  name: string;
  type: "boolean" | "string";
  short?: string;
  default?: boolean | string;
  description: string;
};

export type CommandSpec = {
  name: string;
  summary: string;
  usage: string;
  flags: FlagSpec[];
  examples: string[];
};

const JSON_FLAG: FlagSpec = {
  name: "json",
  type: "boolean",
  default: false,
  description: `Print one JSON object (schema ${SCHEMAS.result}) on stdout and nothing else`,
};

export const COMMANDS: CommandSpec[] = [
  {
    name: "new",
    summary: "Create a project from a template (the default command)",
    usage: `${PACKAGE} [new] <dir> [flags]`,
    flags: [
      JSON_FLAG,
      {
        name: "template",
        type: "string",
        default: "api",
        description: "Template id (see describe)",
      },
      {
        name: "yes",
        short: "y",
        type: "boolean",
        default: false,
        description: "Never prompt; fail with USAGE instead of asking",
      },
      {
        name: "dry-run",
        type: "boolean",
        default: false,
        description: "Validate and list the files that would be written; write nothing",
      },
      {
        name: "no-install",
        type: "boolean",
        default: false,
        description: "Skip bun install (implies --no-verify)",
      },
      {
        name: "no-git",
        type: "boolean",
        default: false,
        description: "Skip git init and the first commit",
      },
      {
        name: "no-verify",
        type: "boolean",
        default: false,
        description: "Skip running the project's verify script after creation",
      },
    ],
    examples: [
      "bun create bun-api my-api",
      `bunx ${PACKAGE} my-api --yes --json`,
      `bunx ${PACKAGE} new services/billing --dry-run --json`,
    ],
  },
  {
    name: "doctor",
    summary: "Check prerequisites (Bun, git, registry access, write access) and print fixes",
    usage: `${PACKAGE} doctor [--json]`,
    flags: [JSON_FLAG],
    examples: [`bunx ${PACKAGE} doctor --json`],
  },
  {
    name: "describe",
    summary: "Print commands, flags, exit codes, error codes, and templates as JSON",
    usage: `${PACKAGE} describe`,
    flags: [],
    examples: [`bunx ${PACKAGE} describe`],
  },
];

export type TemplateSpec = {
  id: string;
  description: string;
  /** Directory under the templates root. */
  dir: string;
  /** Token replaced by the project name in `substituteIn` files. Must be a valid npm name. */
  placeholder: string;
  substituteIn: string[];
  /** Files renamed on copy (npm/bun pack drop dotfiles such as .gitignore). */
  rename: Record<string, string>;
  /** Skill ids from skills/ copied into .agents/skills and .claude/skills. */
  skills: string[];
  verifyCommand: string;
};

export const TEMPLATES: TemplateSpec[] = [
  {
    id: "api",
    description:
      "HTTP API: Elysia, SQLite (bun:sqlite), JWT auth (jose), OpenAPI docs at /docs, bun test, verify script",
    dir: "api",
    placeholder: "bun-api-template-app",
    substituteIn: ["package.json", "bun.lock", "README.md", "AGENTS.md"],
    rename: { gitignore: ".gitignore" },
    skills: ["add-endpoint", "add-model", "verify-and-debug"],
    verifyCommand: "bun run verify --json",
  },
];

/** Overridable for template development and tests. Not part of the public contract. */
export const templatesRoot = () =>
  process.env.BUN_API_TEMPLATES_DIR ?? fileURLToPath(new URL("../templates/", import.meta.url));
export const skillsRoot = () => fileURLToPath(new URL("../skills/", import.meta.url));
