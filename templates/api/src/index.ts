import { createApp } from "./app";
import { ConfigError, loadConfig } from "./config";
import { openDatabase } from "./db/client";
import { createLogger } from "./lib/logger";

function readConfig() {
  try {
    return loadConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    console.error(
      "Fix: copy .env.example to .env and fill in the values (Bun loads .env automatically).",
    );
    process.exit(1);
  }
}

const config = readConfig();
const log = createLogger({ level: config.logLevel });
const db = openDatabase(config.databasePath);
const app = createApp({ config, db, log }).listen(config.port);

log.info("server started", {
  url: `http://localhost:${app.server?.port}`,
  docs: `http://localhost:${app.server?.port}/docs`,
  env: config.nodeEnv,
});

const shutdown = async (signal: string) => {
  log.info("shutting down", { signal });
  await app.stop();
  db.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
