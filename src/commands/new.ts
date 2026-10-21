import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { suggestProjectName, validateProjectName } from "../engine/name";
import { run, tail } from "../engine/proc";
import { planFiles, templateVersion } from "../engine/template";
import { compareVersions } from "../engine/version";
import { CliError } from "../errors";
import { MIN_BUN_VERSION, PACKAGE, TEMPLATES, TOOL } from "../manifest";
import type { Reporter, Result } from "../output";

export type NewOptions = {
  target?: string;
  template: string;
  yes: boolean;
  dryRun: boolean;
  install: boolean;
  git: boolean;
  verify: boolean;
  cwd: string;
};

const elapsed = (start: number) => Math.round(performance.now() - start);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function targetState(path: string): "missing" | "empty-dir" | "occupied" {
  if (!existsSync(path)) return "missing";
  if (statSync(path).isDirectory() && readdirSync(path).length === 0) return "empty-dir";
  return "occupied";
}

function resolveTarget(options: NewOptions, report: Reporter): string {
  if (options.target) return options.target;
  const interactive = !options.yes && !report.json && process.stdin.isTTY && process.stdout.isTTY;
  const answer = interactive
    ? prompt("Project directory (for example my-api):")?.trim()
    : undefined;
  if (answer) return answer;
  throw new CliError(
    "USAGE",
    "Missing the project directory",
    `Pass it as an argument, for example: bunx ${PACKAGE} my-api`,
  );
}

export async function newProject(options: NewOptions, report: Reporter): Promise<Result> {
  const target = resolveTarget(options, report);

  const spec = TEMPLATES.find((t) => t.id === options.template);
  if (!spec) {
    throw new CliError(
      "UNKNOWN_TEMPLATE",
      `Unknown template "${options.template}"`,
      `Available templates: ${TEMPLATES.map((t) => t.id).join(", ")}`,
    );
  }

  const path = resolve(options.cwd, target);
  const name = basename(path);
  const problem = validateProjectName(name);
  if (problem) {
    throw new CliError(
      "INVALID_NAME",
      `Invalid project name "${name}": ${problem}`,
      `Try "${suggestProjectName(name)}"`,
    );
  }

  if (compareVersions(Bun.version, MIN_BUN_VERSION) < 0) {
    throw new CliError(
      "PREREQUISITE_MISSING",
      `Bun ${Bun.version} is older than the required ${MIN_BUN_VERSION}`,
      "Run: bun upgrade",
    );
  }

  const state = targetState(path);
  if (state === "occupied") {
    throw new CliError(
      "TARGET_EXISTS",
      `${path} already exists and is not an empty directory`,
      "Choose another directory, or empty this one first. Nothing was changed.",
    );
  }

  report.project = { name, path, template: spec.id, templateVersion: templateVersion(spec) };

  let start = performance.now();
  const files = planFiles(spec, name);
  report.step({ id: "plan", status: "ok", ms: elapsed(start), detail: `${files.length} files` });

  if (options.dryRun) {
    for (const id of ["write", "install", "git", "verify"]) {
      report.step({ id, status: "skipped", detail: "dry run" });
    }
    return report.result({ dryRun: true, files: files.map((f) => f.path) });
  }

  // Build everything in a sibling temp dir, then rename into place: a failure leaves nothing behind.
  const parent = dirname(path);
  let staging: string;
  try {
    mkdirSync(parent, { recursive: true });
    staging = mkdtempSync(join(parent, `.${name}.${TOOL}-`));
  } catch (error) {
    throw new CliError(
      "WRITE_FAILED",
      `Cannot write to ${parent}: ${message(error)}`,
      "Check permissions, or choose a directory you can write to.",
    );
  }
  const cleanup = () => rmSync(staging, { recursive: true, force: true });
  const onSignal = () => {
    cleanup();
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    start = performance.now();
    try {
      for (const file of files) {
        const out = join(staging, file.path);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, file.content);
      }
    } catch (error) {
      throw new CliError(
        "WRITE_FAILED",
        `Writing files failed: ${message(error)}`,
        "Check free disk space and permissions.",
      );
    }
    report.step({ id: "write", status: "ok", ms: elapsed(start), detail: `${files.length} files` });

    if (options.install) {
      start = performance.now();
      const install = await run([process.execPath, "install", "--frozen-lockfile"], {
        cwd: staging,
      });
      if (install.code !== 0) {
        report.step({ id: "install", status: "failed", ms: elapsed(start) });
        throw new CliError(
          "INSTALL_FAILED",
          install.timedOut ? "bun install timed out after 5 minutes" : "bun install failed",
          `Check registry access with \`bunx ${PACKAGE} doctor\`, or rerun with --no-install and run \`bun install\` later. Nothing was left on disk.`,
          { output: tail(install) },
        );
      }
      report.step({ id: "install", status: "ok", ms: elapsed(start) });
    } else {
      report.step({ id: "install", status: "skipped", detail: "--no-install" });
    }

    if (options.git) await initGit(staging, parent, report);
    else report.step({ id: "git", status: "skipped", detail: "--no-git" });

    if (state === "empty-dir") rmdirSync(path);
    renameSync(staging, path);
  } catch (error) {
    cleanup();
    throw error;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }

  const display = relative(options.cwd, path) || ".";
  if (!options.install) report.step({ id: "verify", status: "skipped", detail: "--no-install" });
  else if (!options.verify) report.step({ id: "verify", status: "skipped", detail: "--no-verify" });
  else await verify(path, display, report);

  return report.result({
    next: [`cd ${display}`, ...(options.install ? [] : ["bun install"]), "bun run dev"],
  });
}

async function initGit(dir: string, parent: string, report: Reporter) {
  const start = performance.now();
  const inside = await run(["git", "rev-parse", "--is-inside-work-tree"], { cwd: parent });
  if (inside.notFound) {
    report.step({ id: "git", status: "skipped", detail: "git not found" });
    report.warn("git is not installed, so no repository was created");
    return;
  }
  if (inside.code === 0 && inside.stdout.trim() === "true") {
    report.step({ id: "git", status: "skipped", detail: "already inside a git repository" });
    return;
  }

  const init = await run(["git", "init", "-q"], { cwd: dir });
  if (init.code !== 0) {
    report.step({ id: "git", status: "skipped", detail: "git init failed" });
    report.warn(`git init failed: ${tail(init, 3)}`);
    return;
  }
  await run(["git", "add", "-A"], { cwd: dir });
  const commit = await run(["git", "commit", "-q", "-m", `Initial commit from create-${TOOL}`], {
    cwd: dir,
  });
  if (commit.code !== 0) {
    report.step({ id: "git", status: "ok", ms: elapsed(start), detail: "initialized, no commit" });
    report.warn(
      "git commit failed (is user.name/user.email set? see doctor); the repository has no commits yet",
    );
    return;
  }
  report.step({
    id: "git",
    status: "ok",
    ms: elapsed(start),
    detail: "initialized with first commit",
  });
}

type VerifyReport = {
  ok: boolean;
  steps: { id: string; ok: boolean; command: string; output?: string }[];
};

async function verify(path: string, display: string, report: Reporter) {
  const start = performance.now();
  const result = await run([process.execPath, "run", "verify", "--json"], { cwd: path });
  let parsed: VerifyReport | undefined;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    parsed = undefined;
  }

  if (result.code === 0 && parsed?.ok) {
    report.step({
      id: "verify",
      status: "ok",
      ms: elapsed(start),
      detail: parsed.steps.map((s) => s.id).join(", "),
    });
    return;
  }

  report.step({ id: "verify", status: "failed", ms: elapsed(start) });
  throw new CliError(
    "VERIFY_FAILED",
    "The new project failed its own verify script",
    `The project was kept for inspection. Run: cd ${display} && bun run verify`,
    parsed ? { failed: parsed.steps.filter((s) => !s.ok) } : { output: tail(result) },
  );
}
