import type { Database } from "bun:sqlite";
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia, t } from "elysia";
import pkg from "../package.json";
import type { Config } from "./config";
import type { Logger } from "./lib/logger";
import { createTokenService } from "./lib/tokens";
import { createUsersRepository } from "./modules/users/users.repository";
import { usersRoutes } from "./modules/users/users.routes";
import { createUsersService } from "./modules/users/users.service";
import { errorHandler } from "./plugins/errors";
import { requestLogger } from "./plugins/request-log";

export type AppDeps = { config: Config; db: Database; log: Logger };

/**
 * Builds the app without listening, so tests can call `app.handle()` directly.
 * Wiring happens here: create services from dependencies, then `.use()` each module.
 */
export function createApp({ config, db, log }: AppDeps) {
  const tokens = createTokenService(config.jwtSecret, config.jwtTtlSeconds);
  const users = createUsersService(createUsersRepository(db), tokens);
  const ping = db.query<{ ok: number }, []>("SELECT 1 AS ok");

  return new Elysia()
    .use(errorHandler(log))
    .use(requestLogger(log))
    .use(cors({ origin: config.corsOrigin }))
    .use(
      openapi({
        path: "/docs",
        documentation: {
          info: { title: pkg.name, version: pkg.version },
          components: {
            securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
          },
        },
      }),
    )
    .get("/health", () => ({ status: "ok" as const, db: ping.get()?.ok === 1 }), {
      response: t.Object({ status: t.Literal("ok"), db: t.Boolean() }),
      detail: { summary: "Liveness and database check", tags: ["system"] },
    })
    .use(usersRoutes({ users, tokens }));
}

export type App = ReturnType<typeof createApp>;
