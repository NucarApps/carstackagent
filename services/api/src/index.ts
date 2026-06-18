import { childLogger, getSql, loadApiConfig } from "@dip/core";
import { buildServer } from "./server.js";

/** Always-on web service entrypoint. */
async function main(): Promise<void> {
  const cfg = loadApiConfig();
  const logger = childLogger({ svc: "api" });
  const sql = getSql({ max: 10 });
  const app = buildServer({
    sql,
    jwtSecret: cfg.SUPABASE_JWT_SECRET,
    corsOrigin: cfg.CORS_ORIGIN,
    logger: true,
  });
  await app.listen({ port: cfg.PORT, host: "0.0.0.0" });
  logger.info({ port: cfg.PORT }, "api listening");
}

main().catch((err) => {
  console.error("api failed to start:", err);
  process.exit(1);
});

export { buildServer } from "./server.js";
