/**
 * Proves the project works: typecheck → lint → test → boot → GET /health.
 *
 *   bun run verify            human-readable summary
 *   bun run verify --json     one JSON object on stdout (schema "bun-api/verify@1")
 *   bun run verify --only test,boot
 *
 * Every step runs, even after a failure, so one run shows every problem.
 * Exit code: 0 when all steps pass, 1 otherwise. Needs no network and no .env.
 */
import { parseArgs } from "node:util";

type StepResult = {
  id: string;
  ok: boolean;
  ms: number;
  command: string;
  /** Last lines of output, only on failure. */
  output?: string;
};

const STEPS = ["typecheck", "lint", "test", "boot"] as const;
type StepId = (typeof STEPS)[number];

const { values } = parseArgs({
  options: { json: { type: "boolean", default: false }, only: { type: "string" } },
});
const selected = (values.only?.split(",") ?? STEPS).filter((s): s is StepId =>
  (STEPS as readonly string[]).includes(s),
);

const bun = process.execPath;
const tail = (text: string, lines = 40) => text.trimEnd().split("\n").slice(-lines).join("\n");

async function run(id: string, argv: string[], env?: Record<string, string>): Promise<StepResult> {
  const started = performance.now();
  const proc = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", ...env },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const ok = code === 0;
  return {
    id,
    ok,
    ms: Math.round(performance.now() - started),
    command: argv.map((a) => (a === bun ? "bun" : a)).join(" "),
    ...(ok ? {} : { output: tail(`${stdout}\n${stderr}`) }),
  };
}

function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port ?? 0;
  probe.stop(true);
  return port;
}

/** Starts the real server with throwaway settings and waits for /health to answer 200. */
async function boot(): Promise<StepResult> {
  const started = performance.now();
  const port = freePort();
  const command = "bun src/index.ts";
  const server = Bun.spawn([bun, "src/index.ts"], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: ":memory:",
      LOG_LEVEL: "warn",
      JWT_SECRET: process.env.JWT_SECRET ?? crypto.randomUUID() + crypto.randomUUID(),
    },
  });
  const output = Promise.all([
    new Response(server.stdout).text(),
    new Response(server.stderr).text(),
  ]).then(([out, err]) => `${out}\n${err}`);

  let ok = false;
  let reason = "timed out after 15s waiting for GET /health";
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      reason = `server exited early with code ${server.exitCode}`;
      break;
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.status === 200) {
        ok = true;
        break;
      }
      reason = `GET /health returned ${res.status}`;
    } catch {
      // not listening yet
    }
    await Bun.sleep(100);
  }

  server.kill("SIGTERM");
  const exited = await Promise.race([server.exited, Bun.sleep(3000).then(() => null)]);
  if (exited === null) server.kill("SIGKILL");

  return {
    id: "boot",
    ok,
    ms: Math.round(performance.now() - started),
    command,
    ...(ok ? {} : { output: tail(`${reason}\n${await output}`) }),
  };
}

const runners: Record<StepId, () => Promise<StepResult>> = {
  typecheck: () => run("typecheck", [bun, "run", "typecheck"]),
  lint: () => run("lint", [bun, "run", "lint"]),
  // Tests must not depend on a developer's .env.
  test: () => run("test", [bun, "test"], { NODE_ENV: "test" }),
  boot,
};

const results: StepResult[] = [];
for (const id of selected) results.push(await runners[id]());
const ok = results.length > 0 && results.every((r) => r.ok);

if (values.json) {
  console.log(JSON.stringify({ schema: "bun-api/verify@1", ok, steps: results }, null, 2));
} else {
  for (const r of results) {
    console.log(
      `${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(9)} ${String(r.ms).padStart(6)}ms  ${r.command}`,
    );
    if (r.output) console.log(`${r.output.replace(/^/gm, "      | ")}\n`);
  }
  console.log(
    ok ? "\nverify: all steps passed" : "\nverify: FAILED (fix the steps above, then rerun)",
  );
}
process.exit(ok ? 0 : 1);
