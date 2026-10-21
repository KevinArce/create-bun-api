import { expect, test } from "bun:test";
import { createTestApp } from "./helpers";

test("GET /health reports ok and a working database", async () => {
  const { request } = createTestApp();
  const res = await request("GET", "/health");

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: "ok", db: true });
});

test("unknown routes return 404 in the standard error shape", async () => {
  const { request } = createTestApp();
  const res = await request("GET", "/does-not-exist");

  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Route not found" } });
});

test("a malformed JSON body returns 400, not 500", async () => {
  const { request } = createTestApp();
  const res = await request("POST", "/auth/login", { body: "{not json" });

  expect(res.status).toBe(400);
  expect(["INVALID_BODY", "VALIDATION"]).toContain(res.body.error.code);
});

test("the OpenAPI document lists every route", async () => {
  const { request } = createTestApp();
  const res = await request("GET", "/docs/json");

  expect(res.status).toBe(200);
  expect(Object.keys(res.body.paths)).toEqual(
    expect.arrayContaining(["/health", "/auth/register", "/auth/login", "/users/me"]),
  );
});

test("each request is logged with method, path, and status", async () => {
  const { request, logs } = createTestApp();
  await request("GET", "/health");
  const entry = logs.map((line) => JSON.parse(line)).find((e) => e.msg === "request");

  expect(entry).toMatchObject({ level: "info", method: "GET", path: "/health", status: 200 });
});
