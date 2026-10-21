#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { describe } from "./commands/describe";
import { doctor } from "./commands/doctor";
import { newProject } from "./commands/new";
import { CliError } from "./errors";
import { help } from "./help";
import { COMMANDS, type CommandSpec, ERROR_CODES, PACKAGE, VERSION } from "./manifest";
import { Reporter, type Result } from "./output";

function parse(spec: CommandSpec, args: string[]) {
  const options = Object.fromEntries(
    spec.flags.map((f) => [f.name, { type: f.type, ...(f.short ? { short: f.short } : {}) }]),
  );
  try {
    const { values, positionals } = parseArgs({
      args,
      options,
      allowPositionals: true,
      strict: true,
    });
    const withDefaults: Record<string, string | boolean | undefined> = {};
    for (const flag of spec.flags)
      withDefaults[flag.name] = (values[flag.name] as never) ?? flag.default;
    return { values: withDefaults, positionals };
  } catch (error) {
    throw new CliError(
      "USAGE",
      error instanceof Error ? error.message : String(error),
      `Run: ${PACKAGE} ${spec.name} --help`,
    );
  }
}

async function main(argv: string[]): Promise<{ output?: string; result?: Result; code: number }> {
  const known = COMMANDS.find((c) => c.name === argv[0]);
  const spec = known ?? (COMMANDS[0] as CommandSpec);
  const args = known ? argv.slice(1) : argv;

  if (argv[0] === "help") return { output: help(argv[1]), code: 0 };
  if (args.includes("--help") || args.includes("-h")) {
    return { output: help(known ? spec.name : undefined), code: 0 };
  }
  if (args.includes("--version") || args.includes("-v")) return { output: VERSION, code: 0 };

  const report = new Reporter(spec.name, args.includes("--json"));
  try {
    if (spec.name === "describe") {
      parse(spec, args);
      return { output: JSON.stringify(describe(), null, 2), code: 0 };
    }

    const { values, positionals } = parse(spec, args);
    let result: Result;
    if (spec.name === "doctor") {
      result = await doctor(process.cwd(), report);
    } else {
      if (positionals.length > 1) {
        throw new CliError(
          "USAGE",
          `Expected one directory, got ${positionals.length}: ${positionals.join(" ")}`,
        );
      }
      result = await newProject(
        {
          target: positionals[0],
          template: String(values.template),
          yes: Boolean(values.yes),
          dryRun: Boolean(values["dry-run"]),
          install: !values["no-install"],
          git: !values["no-git"],
          verify: !values["no-verify"],
          cwd: process.cwd(),
        },
        report,
      );
    }
    const code = result.ok ? 0 : ERROR_CODES[result.error?.code as keyof typeof ERROR_CODES].exit;
    return { result, code };
  } catch (error) {
    const failure =
      error instanceof CliError
        ? error
        : new CliError(
            "INTERNAL",
            error instanceof Error ? error.message : String(error),
            `This is a bug in ${PACKAGE}. Please report it with the --json output.`,
          );
    return { result: report.failure(failure), code: failure.exitCode };
  }
}

function render(result: Result): string {
  if (!result.ok && result.error) {
    const lines = [`✗ ${result.error.code}: ${result.error.message}`];
    if (result.error.hint) lines.push(`  fix: ${result.error.hint}`);
    const details = result.error.details as {
      output?: string;
      failed?: { id: string; output?: string }[];
    };
    if (details?.output) lines.push(details.output.replace(/^/gm, "  | "));
    for (const step of details?.failed ?? []) {
      lines.push(
        `  failed step: ${step.id}`,
        ...(step.output ? [step.output.replace(/^/gm, "  | ")] : []),
      );
    }
    return lines.join("\n");
  }
  if (result.dryRun)
    return `Dry run: would write ${result.files?.length} files\n${result.files?.map((f) => `  ${f}`).join("\n")}`;
  if (result.command === "new" && result.project) {
    return `\nCreated ${result.project.name} (${result.project.template} template)\nNext:\n${result.next?.map((n) => `  ${n}`).join("\n")}`;
  }
  return result.ok ? "All checks passed" : "";
}

const argv = Bun.argv.slice(2);
const { output, result, code } = await main(argv);
if (output !== undefined) console.log(output);
else if (result) {
  if (argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else (result.ok ? console.log : console.error)(render(result));
}
process.exit(code);
