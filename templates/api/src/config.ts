import type { LogLevel } from "./lib/logger";

export type Config = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databasePath: string;
  jwtSecret: string;
  jwtTtlSeconds: number;
  logLevel: LogLevel;
  corsOrigin: "*" | string[];
};

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

const NODE_ENVS = ["development", "test", "production"] as const;
const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"] as const;

/**
 * Reads and validates configuration from environment variables.
 * Collects every problem before throwing, so one run shows everything that needs fixing.
 * Every variable read here must also be documented in `.env.example`.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const problems: string[] = [];

  const oneOf = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
    const value = env[name] ?? fallback;
    if ((allowed as readonly string[]).includes(value)) return value as T;
    problems.push(`${name} must be one of ${allowed.join(", ")} (got "${value}")`);
    return fallback;
  };

  const integer = (name: string, fallback: number, min: number, max: number): number => {
    const raw = env[name];
    if (raw === undefined || raw === "") return fallback;
    const value = Number(raw);
    if (Number.isInteger(value) && value >= min && value <= max) return value;
    problems.push(`${name} must be an integer between ${min} and ${max} (got "${raw}")`);
    return fallback;
  };

  const jwtSecret = env.JWT_SECRET ?? "";
  if (jwtSecret.length < 32) {
    problems.push(
      jwtSecret
        ? "JWT_SECRET must be at least 32 characters"
        : "JWT_SECRET is required (generate one with: openssl rand -hex 32)",
    );
  }

  const corsRaw = (env.CORS_ORIGIN ?? "*").trim();

  const config: Config = {
    nodeEnv: oneOf("NODE_ENV", NODE_ENVS, "development"),
    port: integer("PORT", 3000, 0, 65_535),
    databasePath: env.DATABASE_PATH || "data/app.sqlite",
    jwtSecret,
    jwtTtlSeconds: integer("JWT_TTL_SECONDS", 3600, 60, 60 * 60 * 24 * 30),
    logLevel: oneOf("LOG_LEVEL", LOG_LEVELS, "info"),
    corsOrigin: corsRaw === "*" ? "*" : corsRaw.split(",").map((origin) => origin.trim()),
  };

  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}
