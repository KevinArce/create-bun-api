import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv";
import resultSchema from "../schemas/result.v1.json";

export const CLI = join(import.meta.dir, "..", "src", "cli.ts");

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

/** A fresh directory outside any git repository, removed after the test file finishes. */
export function tempDir(prefix = "bun-api-test-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

export type CliRun = {
  code: number | null;
  stdout: string;
  stderr: string;
  /** Parsed stdout when it is JSON. */
  // biome-ignore lint/suspicious/noExplicitAny: tests assert on CLI output dynamically.
  json: any;
  ms: number;
};

/**
 * Runs the CLI as a separate process. `stdin: "open"` keeps stdin open and silent (like some agent
 * harnesses), the case that used to hang the old tool forever.
 */
export async function runCli(
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdin?: "closed" | "open";
    timeoutMs?: number;
  } = {},
): Promise<CliRun> {
  const started = performance.now();
  const proc = Bun.spawn([process.execPath, CLI, ...args], {
    cwd: options.cwd ?? tempDir(),
    env: { ...process.env, ...options.env },
    stdin: options.stdin === "open" ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => proc.kill("SIGKILL"), options.timeoutMs ?? 20_000);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = undefined;
  }
  return { code, stdout, stderr, json, ms: Math.round(performance.now() - started) };
}

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(resultSchema);

/** Throws with readable errors when `value` doesn't match schemas/result.v1.json. */
export function assertResultSchema(value: unknown) {
  if (!validate(value)) {
    throw new Error(
      `result does not match schema:\n${ajv.errorsText(validate.errors, { separator: "\n" })}`,
    );
  }
}
