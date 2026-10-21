import { Elysia } from "elysia";
import { type ErrorBody, HttpError } from "../lib/errors";
import type { Logger } from "../lib/logger";

type Issue = { path?: string; message?: string; summary?: string };

/** Maps every failure to the single `ErrorResponse` shape with the right HTTP status. */
export const errorHandler = (log: Logger) =>
  new Elysia().onError({ as: "global" }, ({ code, error, set, path, request }): ErrorBody => {
    // instanceof, not `code`: Elysia only tags registered error classes thrown in the same plugin.
    if (error instanceof HttpError) {
      set.status = error.status;
      return error.toBody();
    }
    switch (code) {
      case "VALIDATION": {
        set.status = 400;
        const issues = (error.all as Issue[]).map((issue) => ({
          path: issue.path || "/",
          message: issue.summary ?? issue.message ?? "Invalid value",
        }));
        return {
          error: { code: "VALIDATION", message: "Request validation failed", details: issues },
        };
      }
      case "PARSE":
        set.status = 400;
        return { error: { code: "INVALID_BODY", message: "Request body could not be parsed" } };
      case "NOT_FOUND":
        set.status = 404;
        return { error: { code: "NOT_FOUND", message: "Route not found" } };
      default:
        log.error("unhandled error", { err: error, method: request.method, path });
        set.status = 500;
        return { error: { code: "INTERNAL", message: "Internal server error" } };
    }
  });
