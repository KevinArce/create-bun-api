import { describe, expect, test } from "bun:test";
import { createTestApp, signUp } from "../../../test/helpers";

const credentials = { email: "ada@example.com", password: "correct horse battery" };

describe("POST /auth/register", () => {
  test("creates a user and returns 201 without any password data", async () => {
    const { request } = createTestApp();
    const res = await request("POST", "/auth/register", { body: { ...credentials, name: "Ada" } });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 1, email: credentials.email, name: "Ada" });
    expect(JSON.stringify(res.body)).not.toMatch(/password|argon/i);
  });

  test("returns 409 for an email that is already registered (case-insensitive)", async () => {
    const { request } = createTestApp();
    await request("POST", "/auth/register", { body: credentials });
    const res = await request("POST", "/auth/register", {
      body: { ...credentials, email: "ADA@example.com" },
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  test.each([
    ["an invalid email", { email: "not-an-email", password: "long enough pw" }],
    ["a short password", { email: "ada@example.com", password: "short" }],
    ["a missing password", { email: "ada@example.com" }],
  ])("returns 400 VALIDATION for %s", async (_, body) => {
    const { request } = createTestApp();
    const res = await request("POST", "/auth/register", { body });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  test("stores an argon2id hash with 64 MiB memory cost", async () => {
    const { request, db } = createTestApp();
    await request("POST", "/auth/register", { body: credentials });
    const row = db.query<{ password_hash: string }, []>("SELECT password_hash FROM users").get();

    expect(row?.password_hash).toStartWith("$argon2id$v=19$m=65536,t=2,");
  });
});

describe("POST /auth/login", () => {
  test("returns a bearer token for valid credentials", async () => {
    const { request } = createTestApp();
    await request("POST", "/auth/register", { body: credentials });
    const res = await request("POST", "/auth/login", { body: credentials });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tokenType: "Bearer", expiresIn: 3600 });
    expect(res.body.token).toBeString();
  });

  test("returns the same 401 for a wrong password and an unknown email", async () => {
    const { request } = createTestApp();
    await request("POST", "/auth/register", { body: credentials });
    const wrongPassword = await request("POST", "/auth/login", {
      body: { ...credentials, password: "wrong password!" },
    });
    const unknownEmail = await request("POST", "/auth/login", {
      body: { ...credentials, email: "nobody@example.com" },
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });
});

describe("GET /users/me", () => {
  test("returns the current user for a valid token", async () => {
    const { app, request } = createTestApp();
    const token = await signUp(app);
    const res = await request("GET", "/users/me", { token });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(credentials.email);
  });

  test.each([
    ["no token", undefined],
    ["a malformed token", "not.a.jwt"],
  ])("returns HTTP 401 (not 200) with %s", async (_, token) => {
    const { request } = createTestApp();
    const res = await request("GET", "/users/me", { token });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  test("rejects a token signed with a different secret", async () => {
    const other = createTestApp({ JWT_SECRET: "another-secret-another-secret-another-secret" });
    const token = await signUp(other.app);
    const { request } = createTestApp();

    expect((await request("GET", "/users/me", { token })).status).toBe(401);
  });
});

test("never writes bearer tokens or passwords to the logs", async () => {
  const { app, request, logs } = createTestApp();
  const token = await signUp(app);
  await request("GET", "/users/me", { token });
  await request("GET", "/users/me", { token: "forged.token.value" });

  const allLogs = logs.join("\n");
  expect(logs.length).toBeGreaterThan(0);
  expect(allLogs).not.toContain(token);
  expect(allLogs).not.toContain(credentials.password);
});
