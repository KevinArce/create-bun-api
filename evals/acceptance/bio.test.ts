import { describe, expect, test } from "bun:test";
import { account, call, enabled, uniqueEmail } from "./helpers";

describe.skipIf(!enabled)("user bio contract", () => {
  test("a bio given at registration is returned by /users/me", async () => {
    const { token } = await account("bio", { bio: "Hi, I write compilers." });
    const me = await call("GET", "/users/me", { token });
    expect(me.status).toBe(200);
    expect(me.json?.bio).toBe("Hi, I write compilers.");
  });

  test("without a bio, /users/me returns bio: null", async () => {
    const { token } = await account("nobio");
    const me = await call("GET", "/users/me", { token });
    expect(me.json).toHaveProperty("bio", null);
  });

  test("a bio longer than 500 characters returns 400", async () => {
    const res = await call("POST", "/auth/register", {
      body: { email: uniqueEmail("long"), password: "long enough pw", bio: "x".repeat(501) },
    });
    expect(res.status).toBe(400);
  });

  test("existing behavior still works: wrong password is 401", async () => {
    const { email } = await account("regress");
    const res = await call("POST", "/auth/login", { body: { email, password: "nope nope nope" } });
    expect(res.status).toBe(401);
  });
});
