export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type LogFields = Record<string, unknown>;

export type Logger = {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
};

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

/** Any key containing one of these (case-insensitive, ignoring - and _) is redacted at any depth. */
const SENSITIVE_KEY = /authorization|cookie|password|passwd|token|secret|jwt|apikey|credential/;
// 16+ characters so prose like "missing bearer token" survives; real tokens are far longer.
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const REDACTED = "[redacted]";

const redactString = (value: string) =>
  value.replace(BEARER, `Bearer ${REDACTED}`).replace(JWT, REDACTED);

/** Returns a JSON-safe copy of `value` with secrets removed. Exported for tests. */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactString(value);
  if (typeof value === "bigint") return value.toString();
  if (value === null || typeof value !== "object") return value;
  if (depth > 8) return "[truncated]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[-_]/g, "");
    out[key] = SENSITIVE_KEY.test(normalized) ? REDACTED : redact(inner, depth + 1, seen);
  }
  return out;
}

type LoggerOptions = {
  level: LogLevel;
  /** Where JSON lines go. Defaults to stdout; tests pass a collector. */
  write?: (line: string) => void;
  base?: LogFields;
};

/**
 * Structured JSON logger: one JSON object per line on stdout.
 * Never pass request headers or bodies; redaction is a safety net, not a licence.
 */
export function createLogger({ level, write, base = {} }: LoggerOptions): Logger {
  const sink = write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const threshold = SEVERITY[level];

  const emit = (lvl: Exclude<LogLevel, "silent">, msg: string, fields?: LogFields) => {
    if (SEVERITY[lvl] < threshold) return;
    const entry = { time: new Date().toISOString(), level: lvl, msg, ...base, ...fields };
    sink(JSON.stringify(redact(entry)));
  };

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    child: (fields) => createLogger({ level, write: sink, base: { ...base, ...fields } }),
  };
}
