import { COMMANDS, type CommandSpec, EXIT, PACKAGE, TOOL, VERSION } from "./manifest";

const flagLabel = (f: CommandSpec["flags"][number]) =>
  `${f.short ? `-${f.short}, ` : ""}--${f.name}${f.type === "string" ? " <value>" : ""}`;

/** Help text, generated from the manifest so it can't drift from the real flags. */
export function help(commandName?: string): string {
  const command = COMMANDS.find((c) => c.name === commandName);
  if (command) {
    const width = Math.max(...command.flags.map((f) => flagLabel(f).length), 0) + 2;
    return [
      `${command.summary}`,
      "",
      `Usage: ${command.usage}`,
      "",
      ...(command.flags.length
        ? [
            "Flags:",
            ...command.flags.map(
              (f) =>
                `  ${flagLabel(f).padEnd(width)}${f.description}${f.default !== undefined && f.type === "string" ? ` (default: ${f.default})` : ""}`,
            ),
            "",
          ]
        : []),
      "Examples:",
      ...command.examples.map((e) => `  ${e}`),
    ].join("\n");
  }

  const width = Math.max(...COMMANDS.map((c) => c.name.length)) + 2;
  return [
    `${PACKAGE} ${VERSION}: agent-ready Bun API starter`,
    "",
    "Usage:",
    `  bun create ${TOOL} <dir> [flags]     same as: bunx ${PACKAGE} new <dir> [flags]`,
    `  bunx ${PACKAGE} <command> [flags]`,
    "",
    "Commands:",
    ...COMMANDS.map((c) => `  ${c.name.padEnd(width)}${c.summary}`),
    "",
    `Run \`${PACKAGE} <command> --help\` for flags. Agents: \`${PACKAGE} describe\` prints all of this as JSON.`,
    "",
    `Exit codes: ${Object.entries(EXIT)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ")}`,
  ].join("\n");
}
