import { expect, test } from "bun:test";
import { ConfigError, loadConfig } from "../src/config";

const SECRET = "x".repeat(32);

test("applies defaults when only JWT_SECRET is set", () => {
  expect(loadConfig({ JWT_SECRET: SECRET })).toEqual({
    nodeEnv: "development",
    port: 3000,
    databasePath: "data/app.sqlite",
    jwtSecret: SECRET,
    jwtTtlSeconds: 3600,
    logLevel: "info",
    corsOrigin: "*",
  });
});

test("reports every problem at once", () => {
  let error: unknown;
  try {
    loadConfig({ PORT: "eighty", LOG_LEVEL: "loud", NODE_ENV: "staging" });
  } catch (e) {
    error = e;
  }

  expect(error).toBeInstanceOf(ConfigError);
  const problems = (error as ConfigError).problems.join("\n");
  expect(problems).toContain("JWT_SECRET is required");
  expect(problems).toContain("PORT must be an integer");
  expect(problems).toContain("LOG_LEVEL must be one of");
  expect(problems).toContain("NODE_ENV must be one of");
});

test("rejects a JWT_SECRET shorter than 32 characters", () => {
  expect(() => loadConfig({ JWT_SECRET: "short" })).toThrow("at least 32 characters");
});

test("splits CORS_ORIGIN into a list", () => {
  const config = loadConfig({ JWT_SECRET: SECRET, CORS_ORIGIN: "https://a.dev, https://b.dev" });
  expect(config.corsOrigin).toEqual(["https://a.dev", "https://b.dev"]);
});
