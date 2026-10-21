import { Elysia } from "elysia";
import { unauthorized } from "../lib/errors";
import type { TokenService } from "../lib/tokens";

/**
 * Adds the `auth: true` route option. Routes that set it receive `session.userId`
 * and respond 401 (never 200 with an error body) when the bearer token is missing or invalid.
 * `.use()` this plugin in every module that has protected routes.
 */
export const authPlugin = (tokens: TokenService) =>
  new Elysia().macro({
    auth: {
      async resolve({ headers }) {
        const header = headers.authorization ?? "";
        const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
        if (!token) throw unauthorized("Missing bearer token");

        const claims = await tokens.verify(token);
        if (!claims) throw unauthorized("Invalid or expired token");

        return { session: claims };
      },
    },
  });
