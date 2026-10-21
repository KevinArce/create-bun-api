import { expect, test } from "bun:test";
import { createLogger, redact } from "./logger";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";

test("redacts sensitive keys at any depth", () => {
  const input = {
    user: { email: "a@b.dev", passwordHash: "h", nested: [{ apiKey: "k", ok: 1 }] },
    headers: { Authorization: "Bearer abc", "set-cookie": "s=1" },
    jwtSecret: "s",
  };

  expect(redact(input)).toEqual({
    user: {
      email: "a@b.dev",
      passwordHash: "[redacted]",
      nested: [{ apiKey: "[redacted]", ok: 1 }],
    },
    headers: { Authorization: "[redacted]", "set-cookie": "[redacted]" },
    jwtSecret: "[redacted]",
  });
});

test("redacts bearer tokens and JWTs inside free text and errors", () => {
  expect(redact(`header was Bearer ${JWT}`)).toBe("header was Bearer [redacted]");
  expect(redact(`token ${JWT} rejected`)).toBe("token [redacted] rejected");

  const error = redact(new Error(`bad token ${JWT}`)) as { message: string };
  expect(error.message).toBe("bad token [redacted]");
});

test("handles cycles without throwing", () => {
  const a: Record<string, unknown> = { name: "a" };
  a.self = a;
  expect(redact(a)).toEqual({ name: "a", self: "[circular]" });
});

test("writes one JSON object per line and respects the level", () => {
  const lines: string[] = [];
  const log = createLogger({ level: "info", write: (l) => lines.push(l) }).child({ svc: "api" });
  log.debug("hidden");
  log.info("shown", { n: 1 });

  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0] ?? "")).toMatchObject({
    level: "info",
    msg: "shown",
    svc: "api",
    n: 1,
  });
});
