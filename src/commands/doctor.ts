import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { run } from "../engine/proc";
import { compareVersions } from "../engine/version";
import { CliError } from "../errors";
import { MIN_BUN_VERSION, TOOL } from "../manifest";
import type { Check, Reporter, Result } from "../output";

/** Diagnoses the environment. Never changes anything: every fix is printed as a hint. */
export async function doctor(cwd: string, report: Reporter): Promise<Result> {
  const checks: Check[] = [];

  const bunOk = compareVersions(Bun.version, MIN_BUN_VERSION) >= 0;
  checks.push({
    id: "bun",
    status: bunOk ? "ok" : "fail",
    message: `Bun ${Bun.version} (requires ${MIN_BUN_VERSION} or newer)`,
    ...(bunOk ? {} : { hint: "Run: bun upgrade" }),
  });

  const git = await run(["git", "--version"], { cwd, timeoutMs: 5000 });
  if (git.notFound || git.code !== 0) {
    checks.push({
      id: "git",
      status: "warn",
      message: "git not found; projects are created without a repository",
      hint: "Install git: https://git-scm.com/downloads",
    });
  } else {
    const email = await run(["git", "config", "user.email"], { cwd, timeoutMs: 5000 });
    const identity = email.code === 0 && email.stdout.trim() !== "";
    checks.push({
      id: "git",
      status: identity ? "ok" : "warn",
      message: identity
        ? git.stdout.trim()
        : `${git.stdout.trim()}, but user.email is not set, so the first commit is skipped`,
      ...(identity
        ? {}
        : {
            hint: 'git config --global user.name "Your Name" && git config --global user.email you@example.com',
          }),
    });
  }

  const registry =
    process.env.BUN_CONFIG_REGISTRY ??
    process.env.NPM_CONFIG_REGISTRY ??
    "https://registry.npmjs.org/";
  try {
    const res = await fetch(new URL("-/ping", registry.endsWith("/") ? registry : `${registry}/`), {
      signal: AbortSignal.timeout(5000),
    });
    checks.push({
      id: "registry",
      status: res.ok ? "ok" : "warn",
      message: `${registry} answered ${res.status}`,
      ...(res.ok ? {} : { hint: "bun install may fail; use --no-install to scaffold offline" }),
    });
  } catch (error) {
    checks.push({
      id: "registry",
      status: "warn",
      message: `Cannot reach ${registry} (${error instanceof Error ? error.message : error})`,
      hint: "bun install needs the registry; use --no-install to scaffold offline",
    });
  }

  try {
    rmSync(mkdtempSync(join(cwd, `.${TOOL}-doctor-`)), { recursive: true, force: true });
    checks.push({ id: "write", status: "ok", message: `Can write to ${cwd}` });
  } catch {
    checks.push({
      id: "write",
      status: "fail",
      message: `Cannot write to ${cwd}`,
      hint: "Run from a directory you can write to",
    });
  }

  for (const check of checks) {
    const mark = { ok: "✓", warn: "!", fail: "✗" }[check.status];
    report.say(
      `${mark} ${check.id}: ${check.message}${check.hint ? `\n    fix: ${check.hint}` : ""}`,
    );
  }

  const failed = checks.filter((c) => c.status === "fail");
  if (failed.length === 0) return report.result({ checks });
  return {
    ...report.failure(
      new CliError(
        "PREREQUISITE_MISSING",
        `Failed checks: ${failed.map((c) => c.id).join(", ")}`,
        failed
          .map((c) => c.hint)
          .filter(Boolean)
          .join("; "),
      ),
    ),
    checks,
  };
}
