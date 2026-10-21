import { ERROR_CODES, type ErrorCode } from "./manifest";

/** Every expected failure. `hint` tells the caller (human or agent) the next thing to try. */
export class CliError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly hint?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "CliError";
  }

  get exitCode(): number {
    return ERROR_CODES[this.code].exit;
  }
}
