// Vercel serverless entry for the api. Vercel compiles this file directly (it is
// intentionally outside src/ so the @dip/api tsc build and lint ignore it). It
// wraps the existing Fastify app — every route/handler in src/ is reused
// unchanged — and forwards Node's (req,res) into it. DB env vars are provided by
// the Vercel↔Supabase integration (POSTGRES_URL etc.; see loadDatabaseUrl).
//
// Initialization is lazy and fully guarded: config parsing, the DB client, and
// the workspace imports all happen on first request inside a try/catch, so a
// missing env var (e.g. SUPABASE_JWT_SECRET) or a bundling issue surfaces as a
// readable JSON 500 instead of an opaque FUNCTION_INVOCATION_FAILED crash.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";

let appPromise: Promise<FastifyInstance> | undefined;

async function init(): Promise<FastifyInstance> {
  // Dynamic imports: if a workspace package fails to resolve/bundle at runtime,
  // the error is caught below and reported instead of crashing module load.
  const { getSql, loadApiConfig } = await import("@dip/core");
  const { buildServer } = await import("../dist/server.js");

  const cfg = loadApiConfig();
  const app = buildServer({
    sql: getSql({ max: 5 }),
    jwtSecret: cfg.SUPABASE_JWT_SECRET,
    corsOrigin: cfg.CORS_ORIGIN,
    logger: false,
  });
  await app.ready();
  return app;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let app: FastifyInstance;
  try {
    if (!appPromise) appPromise = init();
    app = await appPromise;
  } catch (err) {
    appPromise = undefined; // let the next request retry once the env is fixed
    console.error("api function initialization failed:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        error: "initialization_failed",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return;
  }

  // The rewrite in vercel.json sends root-level paths (/worklist) here prefixed
  // as /api/worklist. Fastify routes are registered without that prefix, so
  // strip a single leading /api segment before dispatching.
  const url = req.url ?? "/";
  if (url === "/api") req.url = "/";
  else if (url.startsWith("/api/")) req.url = url.slice(4);

  app.server.emit("request", req, res);
}
