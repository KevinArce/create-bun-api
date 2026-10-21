import type { CliError } from "./errors";
import { SCHEMAS, VERSION } from "./manifest";

export type StepStatus = "ok" | "skipped" | "failed";
export type Step = { id: string; status: StepStatus; ms?: number; detail?: string };
export type Check = { id: string; status: "ok" | "warn" | "fail"; message: string; hint?: string };

export type Project = { name: string; path: string; template: string; templateVersion: string };

/** The one JSON object `--json` prints. Mirrors schemas/result.v1.json. */
export type Result = {
  schema: typeof SCHEMAS.result;
  ok: boolean;
  command: string;
  version: string;
  dryRun?: boolean;
  project?: Project;
  steps?: Step[];
  files?: string[];
  checks?: Check[];
  warnings: string[];
  next?: string[];
  error?: { code: string; message: string; hint?: string; details?: unknown };
};

/**
 * Collects steps and warnings. In human mode it also prints progress to stderr;
 * in JSON mode it stays silent so stdout carries exactly one JSON object.
 */
export class Reporter {
  readonly steps: Step[] = [];
  readonly warnings: string[] = [];
  project?: Project;

  constructor(
    readonly command: string,
    readonly json: boolean,
  ) {}

  step(step: Step) {
    this.steps.push(step);
    if (this.json) return;
    const mark = { ok: "✓", skipped: "-", failed: "✗" }[step.status];
    const ms = step.ms === undefined ? "" : ` (${step.ms}ms)`;
    this.say(`${mark} ${step.id}${step.detail ? `: ${step.detail}` : ""}${ms}`);
  }

  warn(message: string) {
    this.warnings.push(message);
    if (!this.json) this.say(`! ${message}`);
  }

  say(line: string) {
    if (!this.json) process.stderr.write(`${line}\n`);
  }

  result(extra: Partial<Result> = {}): Result {
    return {
      schema: SCHEMAS.result,
      ok: true,
      command: this.command,
      version: VERSION,
      ...(this.project ? { project: this.project } : {}),
      ...(this.steps.length ? { steps: this.steps } : {}),
      warnings: this.warnings,
      ...extra,
    };
  }

  failure(error: CliError): Result {
    return this.result({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.hint ? { hint: error.hint } : {}),
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
  }
}
