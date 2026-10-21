import {
  COMMANDS,
  ERROR_CODES,
  EXIT,
  MIN_BUN_VERSION,
  PACKAGE,
  SCHEMAS,
  TEMPLATES,
  TOOL,
  VERSION,
} from "../manifest";

/** Everything an agent needs to drive this CLI, without reading docs or source. */
export function describe() {
  return {
    schema: SCHEMAS.describe,
    name: TOOL,
    package: PACKAGE,
    version: VERSION,
    minBunVersion: MIN_BUN_VERSION,
    invocation: [`bun create ${TOOL} <dir> [flags]`, `bunx ${PACKAGE} <command> [flags]`],
    behavior: [
      "Never prompts unless stdin and stdout are a TTY and the directory argument is missing",
      "Never runs remote scripts or installs system software",
      "With --json, stdout carries exactly one JSON object; nothing else is printed",
      "A failed run leaves nothing on disk, except VERIFY_FAILED, which keeps the project for inspection",
    ],
    commands: COMMANDS,
    exitCodes: EXIT,
    errorCodes: ERROR_CODES,
    templates: TEMPLATES.map(({ id, description, skills, verifyCommand }) => ({
      id,
      description,
      skills,
      verifyCommand,
    })),
    resultSchema: { id: SCHEMAS.result, file: "schemas/result.v1.json" },
  };
}
