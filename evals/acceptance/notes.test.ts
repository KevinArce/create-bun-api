import { describe, expect, test } from "bun:test";
import { account, call, enabled } from "./helpers";

describe.skipIf(!enabled)("notes contract", () => {
  test("all note routes require a bearer token", async () => {
    expect((await call("GET", "/notes")).status).toBe(401);
    expect((await call("POST", "/notes", { body: { title: "x" } })).status).toBe(401);
  });

  test("create returns 201 with id and title; list returns only my notes", async () => {
    const { token } = await account("notes");
    const created = await call("POST", "/notes", {
      token,
      body: { title: "Hello", body: "World" },
    });
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ title: "Hello" });
    expect(typeof created.json?.id).toBe("number");

    const list = await call("GET", "/notes", { token });
    expect(list.status).toBe(200);
    expect(Array.isArray(list.json)).toBe(true);
    expect(list.json).toHaveLength(1);
  });

  test("an empty or 201-character title returns 400", async () => {
    const { token } = await account("valid");
    expect((await call("POST", "/notes", { token, body: { title: "" } })).status).toBe(400);
    expect((await call("POST", "/notes", { token, body: { title: "x".repeat(201) } })).status).toBe(
      400,
    );
  });

  test("get and delete my note; afterwards it is 404", async () => {
    const { token } = await account("delete");
    const { json } = await call("POST", "/notes", { token, body: { title: "Temp" } });
    expect((await call("GET", `/notes/${json.id}`, { token })).status).toBe(200);
    expect((await call("DELETE", `/notes/${json.id}`, { token })).status).toBe(204);
    expect((await call("GET", `/notes/${json.id}`, { token })).status).toBe(404);
  });

  test("another user's note is 404 for get and delete, and stays intact", async () => {
    const alice = await account("alice");
    const bob = await account("bob");
    const { json } = await call("POST", "/notes", { token: alice.token, body: { title: "Mine" } });

    expect((await call("GET", `/notes/${json.id}`, { token: bob.token })).status).toBe(404);
    expect((await call("DELETE", `/notes/${json.id}`, { token: bob.token })).status).toBe(404);
    expect((await call("GET", `/notes/${json.id}`, { token: alice.token })).status).toBe(200);
  });
});
