import { Elysia } from "elysia";
import type { Logger } from "../lib/logger";

/** One line per request: method, path, status, duration. Never headers or bodies. */
export const requestLogger = (log: Logger) => {
  const startedAt = new WeakMap<Request, number>();

  return new Elysia()
    .onRequest(({ request }) => {
      startedAt.set(request, performance.now());
    })
    .onAfterResponse({ as: "global" }, ({ request, path, set }) => {
      const start = startedAt.get(request);
      log.info("request", {
        method: request.method,
        path,
        status: set.status,
        ms: start === undefined ? undefined : Math.round(performance.now() - start),
      });
    });
};
