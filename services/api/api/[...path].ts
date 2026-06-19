// Vercel serverless entry for the api. Vercel compiles this file directly (it is
// intentionally outside src/ so the @dip/api tsc build and lint ignore it). It
// wraps the existing Fastify app — every route/handler in src/ is reused
// unchanged. DB env vars come from the Vercel↔Supabase integration (POSTGRES_URL
// etc.; see loadDatabaseUrl).
//
// Dispatch uses Fastify's in-memory app.inject() rather than
// app.server.emit("request", ...). The emit-the-raw-http-server pattern is
// fragile under Vercel: when Fastify writes to Vercel's response object it can
// emit an unhandled "error" event that crashes the process uncaught
// (FUNCTION_INVOCATION_FAILED) outside any try/catch. inject() runs the full
// route stack in memory and returns a plain result we write to res exactly once,
// so EVERYTHING — init, body read, dispatch — is inside one guard and any
// failure comes back as a readable JSON 500 instead of an opaque crash.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance, InjectOptions } from "fastify";

let appPromise: Promise<FastifyInstance> | undefined;

async function init(): Promise<FastifyInstance> {
  // Dynamic imports: if a workspace package fails to resolve/bundle at runtime,
  // the rejection is caught below and reported instead of crashing module load.
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

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    if (!appPromise) appPromise = init();
    const app = await appPromise;

    // The rewrite in vercel.json sends root-level paths (/worklist) here prefixed
    // as /api/worklist. Fastify routes are registered without that prefix, so
    // strip a single leading /api segment before dispatching.
    let url = req.url ?? "/";
    if (url === "/api") url = "/";
    else if (url.startsWith("/api/")) url = url.slice(4);

    const payload = await readBody(req);
    const injectOptions: InjectOptions = {
      method: (req.method ?? "GET") as InjectOptions["method"],
      url,
      headers: req.headers as InjectOptions["headers"],
      ...(payload ? { payload } : {}),
    };
    const response = await app.inject(injectOptions);

    res.statusCode = response.statusCode;
    for (const [key, value] of Object.entries(response.headers)) {
      if (value !== undefined) res.setHeader(key, value as string | string[] | number);
    }
    res.end(response.rawPayload);
  } catch (err) {
    appPromise = undefined; // let the next request retry once the env is fixed
    console.error("api function error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          error: "function_error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
}
