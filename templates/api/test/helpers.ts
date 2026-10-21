import { type App, createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { openDatabase } from "../src/db/client";
import { createLogger } from "../src/lib/logger";

export const TEST_JWT_SECRET = "test-only-secret-0123456789abcdef0123456789abcdef";

/** A fresh app on an in-memory database. `logs` collects every JSON log line it writes. */
export function createTestApp(env: Record<string, string> = {}) {
  const logs: string[] = [];
  const config = loadConfig({
    NODE_ENV: "test",
    JWT_SECRET: TEST_JWT_SECRET,
    DATABASE_PATH: ":memory:",
    ...env,
  });
  const db = openDatabase(config.databasePath);
  const log = createLogger({ level: "debug", write: (line) => logs.push(line) });
  const app = createApp({ config, db, log });
  return { app, db, logs, request: (...args: RequestArgs) => request(app, ...args) };
}

type RequestArgs = [
  method: string,
  path: string,
  options?: { body?: unknown; token?: string; headers?: Record<string, string> },
];

/** Calls the app in-process, with no network. Returns status plus the parsed JSON body. */
export async function request(app: App, ...[method, path, options = {}]: RequestArgs) {
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) headers["content-type"] ??= "application/json";
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  // Keep "http://localhost": Elysia's fast path parser misreads very short hosts like "http://x/".
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body:
        options.body === undefined
          ? undefined
          : typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body),
    }),
  );
  const text = await response.text();
  // onAfterResponse hooks (request logging) run after handle() resolves; let them finish
  // so assertions on `logs` see every line.
  await new Promise((resolve) => setTimeout(resolve, 0));
  // biome-ignore lint/suspicious/noExplicitAny: tests assert on response bodies dynamically.
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  return { status: response.status, body, text, headers: response.headers };
}

/** Registers a user and logs in; returns the bearer token. */
export async function signUp(
  app: App,
  email = "ada@example.com",
  password = "correct horse battery",
) {
  await request(app, "POST", "/auth/register", { body: { email, password, name: "Ada" } });
  const login = await request(app, "POST", "/auth/login", { body: { email, password } });
  return login.body.token as string;
}
