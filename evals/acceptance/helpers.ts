/** Black-box helpers: acceptance tests only talk HTTP to EVAL_BASE_URL, never import project code. */
export const BASE = process.env.EVAL_BASE_URL ?? "";
export const enabled = BASE !== "";

export async function call(
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  // biome-ignore lint/suspicious/noExplicitAny: assertions inspect arbitrary response shapes.
  return { status: res.status, json: json as any, text };
}

export const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID().slice(0, 8)}@example.com`;

/** Registers and logs in; returns the token. Fails loudly if the auth contract is broken. */
export async function account(tag: string, extra: Record<string, unknown> = {}) {
  const email = uniqueEmail(tag);
  const password = "correct horse battery";
  const reg = await call("POST", "/auth/register", { body: { email, password, ...extra } });
  if (reg.status !== 201) throw new Error(`register returned ${reg.status}: ${reg.text}`);
  const login = await call("POST", "/auth/login", { body: { email, password } });
  if (login.status !== 200 || typeof login.json?.token !== "string") {
    throw new Error(`login returned ${login.status}: ${login.text}`);
  }
  return { email, token: login.json.token as string };
}
