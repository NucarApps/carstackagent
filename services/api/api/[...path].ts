// Vercel serverless entry for the api. Vercel compiles this file directly (it is
// intentionally outside src/ so the @dip/api tsc build and lint ignore it). It
// wraps the existing Fastify app — every route/handler in src/ is reused
// unchanged — and forwards Node's (req,res) into it. DB env vars are provided by
// the Vercel↔Supabase integration (POSTGRES_URL etc.; see loadDatabaseUrl).
import type { IncomingMessage, ServerResponse } from "node:http";
import { getSql, loadApiConfig } from "@dip/core";
import { buildServer } from "../dist/server.js";

const cfg = loadApiConfig();
const app = buildServer({
  sql: getSql({ max: 5 }),
  jwtSecret: cfg.SUPABASE_JWT_SECRET,
  corsOrigin: cfg.CORS_ORIGIN,
  logger: false,
});

let ready: PromiseLike<unknown> | undefined;

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!ready) ready = app.ready();
  await ready;
  app.server.emit("request", req, res);
}
