/** Boots a project with `bun run start` on a free port and waits until it answers HTTP. */
export async function startProject(dir: string, timeoutMs = 30_000) {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port ?? 0;
  probe.stop(true);

  const proc = Bun.spawn([process.execPath, "run", "start"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex"),
      DATABASE_PATH: ":memory:",
      LOG_LEVEL: "warn",
    },
  });
  const output = Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]).then(([out, err]) => `${out}\n${err}`.trim());

  const url = `http://127.0.0.1:${port}`;
  const stop = async () => {
    proc.kill("SIGTERM");
    const exited = await Promise.race([proc.exited, Bun.sleep(3000).then(() => null)]);
    if (exited === null) proc.kill("SIGKILL");
  };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      return {
        ok: false as const,
        url,
        stop,
        error: `exited with ${proc.exitCode}\n${await output}`,
      };
    }
    try {
      await fetch(url);
      return { ok: true as const, url, stop, error: "" };
    } catch {
      await Bun.sleep(200);
    }
  }
  await stop();
  return {
    ok: false as const,
    url,
    stop,
    error: `no HTTP response within ${timeoutMs}ms\n${await output}`,
  };
}
