/**
 * Runs eval tasks against coding agents and grades them with hidden black-box acceptance tests.
 *
 *   bun evals/run.ts --agent oracle                       free: scripted solutions, must all PASS
 *   bun evals/run.ts --agent noop                         free: does nothing, must all FAIL
 *   bun evals/run.ts --agent claude --task add-notes      prints what would run (no agent is started)
 *   bun evals/run.ts --agent claude --arm both --reps 5 --execute
 *
 * --execute starts real agents with auto-approved file edits and shell commands in temporary
 * directories. It spends the agent account's quota or credits. Prefer a container or VM.
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ROOT } from "../src/manifest";
import { startProject } from "./lib/server";
import { type Arm, TASKS, type Task } from "./tasks";

const AGENTS = {
  oracle: null,
  noop: null,
  claude: (prompt: string, model?: string) => [
    "claude",
    "-p",
    prompt,
    "--output-format",
    "json",
    "--permission-mode",
    "acceptEdits",
    "--allowedTools",
    "Bash,Read,Edit,Write,Glob,Grep",
    // Don't let the operator's personal settings or MCP servers skew results.
    "--setting-sources",
    "project",
    "--strict-mcp-config",
    ...(model ? ["--model", model] : []),
  ],
  gemini: (prompt: string, model?: string) => [
    "gemini",
    "-p",
    prompt,
    "--output-format",
    "json",
    "--approval-mode",
    "yolo",
    ...(model ? ["-m", model] : []),
  ],
  // Untested: codex was not installed when this harness was written.
  codex: (prompt: string, model?: string) => [
    "codex",
    "exec",
    "--json",
    "--full-auto",
    ...(model ? ["-m", model] : []),
    prompt,
  ],
} as const;
type AgentId = keyof typeof AGENTS;

const { values } = parseArgs({
  options: {
    agent: { type: "string", default: "oracle" },
    task: { type: "string", default: "all" },
    arm: { type: "string", default: "toolkit" },
    reps: { type: "string", default: "1" },
    model: { type: "string" },
    execute: { type: "boolean", default: false },
    "timeout-min": { type: "string", default: "20" },
  },
});

const agent = values.agent as AgentId;
if (!(agent in AGENTS)) throw new Error(`--agent must be one of ${Object.keys(AGENTS).join(", ")}`);
const tasks =
  values.task === "all" ? TASKS : TASKS.filter((t) => values.task?.split(",").includes(t.id));
if (tasks.length === 0) throw new Error(`no task matches --task ${values.task}`);
const arms: Arm[] = values.arm === "both" ? ["toolkit", "baseline"] : [values.arm as Arm];
const reps = Number(values.reps);
const live = agent === "oracle" || agent === "noop" || values.execute;
const timeoutMs = Number(values["timeout-min"]) * 60_000;

type RunResult = {
  task: string;
  arm: Arm;
  agent: AgentId;
  rep: number;
  root: string;
  passed: boolean;
  tests: { pass: number; fail: number };
  bootError?: string;
  agentExit?: number | null;
  durationMs?: number;
  turns?: number;
  costUsd?: number;
  tokens?: number;
};

/** Best-effort usage numbers from each agent's JSON output. */
function usage(id: AgentId, stdout: string): Pick<RunResult, "turns" | "costUsd" | "tokens"> {
  try {
    const out = JSON.parse(stdout);
    if (id === "claude") {
      const u = out.usage ?? {};
      return {
        turns: out.num_turns,
        costUsd: out.total_cost_usd,
        tokens:
          (u.input_tokens ?? 0) +
          (u.output_tokens ?? 0) +
          (u.cache_read_input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0),
      };
    }
    if (id === "gemini") {
      const models = Object.values(out.stats?.models ?? {}) as { tokens?: { total?: number } }[];
      return { tokens: models.reduce((n, m) => n + (m.tokens?.total ?? 0), 0) };
    }
  } catch {
    // codex prints JSON lines, other formats unknown: keep the raw output only.
  }
  return {};
}

async function grade(
  task: Task,
  root: string,
): Promise<Pick<RunResult, "passed" | "tests" | "bootError">> {
  const app = join(root, "app");
  if (!existsSync(join(app, "package.json"))) {
    return {
      passed: false,
      tests: { pass: 0, fail: 0 },
      bootError: "app/package.json was not created",
    };
  }
  Bun.spawnSync([process.execPath, "install"], { cwd: app });
  const server = await startProject(app);
  if (!server.ok) return { passed: false, tests: { pass: 0, fail: 0 }, bootError: server.error };
  try {
    const proc = Bun.spawnSync([process.execPath, "test", task.acceptance], {
      cwd: ROOT,
      env: { ...process.env, EVAL_BASE_URL: server.url },
    });
    const output = `${proc.stdout}\n${proc.stderr}`;
    const count = (word: string) => Number(output.match(new RegExp(`(\\d+) ${word}\\n`))?.[1] ?? 0);
    const tests = { pass: count("pass"), fail: count("fail") };
    return { passed: proc.exitCode === 0 && tests.pass > 0 && tests.fail === 0, tests };
  } finally {
    await server.stop();
  }
}

async function runOne(task: Task, arm: Arm, rep: number): Promise<RunResult | null> {
  const root = mkdtempSync(join(tmpdir(), `bun-api-eval-${task.id}-${arm}-`));
  const extraPath = await task.prepare(root, arm);
  const cwd = task.agentCwd === "root" ? root : join(root, "app");
  const base = { task: task.id, arm, agent, rep, root };

  if (agent === "oracle" || agent === "noop") {
    if (agent === "oracle") await task.oracle(root);
    return { ...base, ...(await grade(task, root)) };
  }

  const argv = AGENTS[agent](task.prompt, values.model);
  if (!live) {
    console.log(
      `\n[dry run] ${task.id} / ${arm} / rep ${rep}\n  cwd: ${cwd}\n  PATH+: ${extraPath.join(":") || "-"}\n  cmd: ${argv.slice(0, 2).join(" ")} <prompt> ${argv.slice(3).join(" ")}`,
    );
    return null;
  }

  const started = performance.now();
  const proc = Bun.spawn(argv, {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PATH: [...extraPath, process.env.PATH].join(":") },
  });
  const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
  const [stdout, stderr, agentExit] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  writeFileSync(join(root, "agent-stdout.txt"), stdout);
  writeFileSync(join(root, "agent-stderr.txt"), stderr);

  return {
    ...base,
    agentExit,
    durationMs: Math.round(performance.now() - started),
    ...usage(agent, stdout),
    ...(await grade(task, root)),
  };
}

const median = (xs: number[]) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : undefined;
};

if (values.execute && AGENTS[agent] !== null) {
  console.error(
    `Starting real ${agent} sessions with auto-approved edits and shell commands (${tasks.length} task(s) × ${arms.length} arm(s) × ${reps} rep(s)). This uses your agent quota or credits.`,
  );
}

const results: RunResult[] = [];
for (const task of tasks) {
  for (const arm of arms) {
    for (let rep = 1; rep <= reps; rep++) {
      const result = await runOne(task, arm, rep);
      if (!result) continue;
      results.push(result);
      const status = result.passed ? "PASS" : "FAIL";
      console.log(
        `${status}  ${task.id.padEnd(16)} ${arm.padEnd(8)} rep ${rep}  tests ${result.tests.pass}/${result.tests.pass + result.tests.fail}${result.bootError ? `  boot: ${result.bootError.split("\n")[0]}` : ""}  ${result.root}`,
      );
    }
  }
}

if (results.length > 0) {
  console.log(
    "\ntask              arm       runs  pass-rate  med-turns  med-cost  med-tokens  med-min",
  );
  for (const task of tasks) {
    for (const arm of arms) {
      const group = results.filter((r) => r.task === task.id && r.arm === arm);
      if (group.length === 0) continue;
      const rate = group.filter((r) => r.passed).length / group.length;
      const fmt = (v: number | undefined, digits = 0) =>
        v === undefined ? "-" : v.toFixed(digits);
      console.log(
        [
          task.id.padEnd(17),
          arm.padEnd(9),
          String(group.length).padEnd(5),
          `${Math.round(rate * 100)}%`.padEnd(10),
          fmt(median(group.map((r) => r.turns ?? Number.NaN))).padEnd(10),
          fmt(median(group.map((r) => r.costUsd ?? Number.NaN)), 2).padEnd(9),
          fmt(median(group.map((r) => r.tokens ?? Number.NaN))).padEnd(11),
          fmt(median(group.map((r) => (r.durationMs ?? Number.NaN) / 60_000)), 1),
        ].join(" "),
      );
    }
  }
  const outDir = join(ROOT, "evals", "runs");
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${agent}.json`);
  writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\nresults: ${file}`);
}

// noop is a floor check: it succeeds only when every task FAILS without any work.
const expectation =
  agent === "noop" ? !results.some((r) => r.passed) : results.every((r) => r.passed);
process.exit(expectation ? 0 : 1);
