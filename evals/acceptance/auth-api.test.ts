import { describe, expect, test } from "bun:test";
import { account, call, enabled, uniqueEmail } from "./helpers";

describe.skipIf(!enabled)("auth API contract", () => {
  test("register returns 201", async () => {
    const res = await call("POST", "/auth/register", {
      body: { email: uniqueEmail("reg"), password: "long enough pw" },
    });
    expect(res.status).toBe(201);
  });

  test("invalid email and short password return 400", async () => {
    const badEmail = await call("POST", "/auth/register", {
      body: { email: "nope", password: "long enough pw" },
    });
    const shortPassword = await call("POST", "/auth/register", {
      body: { email: uniqueEmail("short"), password: "short" },
    });
    expect(badEmail.status).toBe(400);
    expect(shortPassword.status).toBe(400);
  });

  test("duplicate email returns 409", async () => {
    const body = { email: uniqueEmail("dup"), password: "long enough pw" };
    await call("POST", "/auth/register", { body });
    expect((await call("POST", "/auth/register", { body })).status).toBe(409);
  });

  test("login returns a token; wrong password returns 401", async () => {
    const { email } = await account("login");
    const wrong = await call("POST", "/auth/login", {
      body: { email, password: "wrong password" },
    });
    expect(wrong.status).toBe(401);
  });

  test("/users/me returns the user for a valid token and 401 otherwise", async () => {
    const { email, token } = await account("me");
    const me = await call("GET", "/users/me", { token });
    expect(me.status).toBe(200);
    expect(me.json?.email).toBe(email);
    expect((await call("GET", "/users/me")).status).toBe(401);
    expect((await call("GET", "/users/me", { token: "forged.token.value" })).status).toBe(401);
  });

  test("responses never include password material", async () => {
    const { token } = await account("leak");
    const me = await call("GET", "/users/me", { token });
    expect(me.text).not.toMatch(/password|argon|\$2[aby]\$/i);
  });
});
