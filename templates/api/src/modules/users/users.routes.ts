import { Elysia } from "elysia";
import { ErrorResponse } from "../../lib/errors";
import type { TokenService } from "../../lib/tokens";
import { authPlugin } from "../../plugins/auth";
import { LoginBody, RegisterBody, TokenResponse, UserSchema } from "./users.schema";
import type { UsersService } from "./users.service";

/** HTTP layer only: schemas, status codes, docs. Logic lives in users.service.ts. */
export const usersRoutes = (deps: { users: UsersService; tokens: TokenService }) =>
  new Elysia({ tags: ["users"] })
    .use(authPlugin(deps.tokens))
    .post(
      "/auth/register",
      async ({ body, status }) => status(201, await deps.users.register(body)),
      {
        body: RegisterBody,
        response: { 201: UserSchema, 400: ErrorResponse, 409: ErrorResponse },
        detail: { summary: "Create an account" },
      },
    )
    .post("/auth/login", ({ body }) => deps.users.login(body), {
      body: LoginBody,
      response: { 200: TokenResponse, 400: ErrorResponse, 401: ErrorResponse },
      detail: { summary: "Exchange email and password for a bearer token" },
    })
    .get("/users/me", ({ session }) => deps.users.getById(session.userId), {
      auth: true,
      response: { 200: UserSchema, 401: ErrorResponse, 404: ErrorResponse },
      detail: { summary: "The authenticated user", security: [{ bearer: [] }] },
    });
