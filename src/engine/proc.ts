export type ProcResult = {
  /** null when the program could not be started (for example, not installed). */
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  notFound: boolean;
};

/** Runs a program with arguments (never through a shell), capturing output. */
export async function run(
  argv: string[],
  options: { cwd: string; env?: Record<string, string | undefined>; timeoutMs?: number },
): Promise<ProcResult> {
  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    proc = Bun.spawn(argv, {
      cwd: options.cwd,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", ...options.env },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch {
    return { code: null, stdout: "", stderr: "", timedOut: false, notFound: true };
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGKILL");
  }, options.timeoutMs ?? 300_000);

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  return { code: timedOut ? null : code, stdout, stderr, timedOut, notFound: false };
}

/** Last `lines` lines of combined output, for error details without flooding a context window. */
export const tail = (result: Pick<ProcResult, "stdout" | "stderr">, lines = 30) =>
  `${result.stdout}\n${result.stderr}`.trim().split("\n").slice(-lines).join("\n");
