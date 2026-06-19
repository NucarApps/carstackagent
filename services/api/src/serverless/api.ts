// Serverless entry for the API. Bundled by scripts/build-vercel.mjs into a
// self-contained CommonJS Vercel function (Build Output API) — NOT compiled by
// @vercel/node — which avoids the monorepo/ESM function-load failures that made
// every raw api/*.ts function return FUNCTION_INVOCATION_FAILED.
//
// Reuses the existing Fastify app unchanged. Dispatch is via Fastify's in-memory
// app.inject(): init, body read, and routing all run inside one try/catch, so no
// path can crash the function process — any failure returns a readable JSON 500.
// Build Output routing preserves the original request path, so Fastify's
// unprefixed routes (/healthz, /worklist, ...) match directly.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance, InjectOptions } from "fastify";
import { getSql, loadApiConfig } from "@dip/core";
import { buildServer } from "../server.js";

let appPromise: Promise<FastifyInstance> | undefined;

async function init(): Promise<FastifyInstance> {
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

    const payload = await readBody(req);
    const injectOptions: InjectOptions = {
      method: (req.method ?? "GET") as InjectOptions["method"],
      url: req.url ?? "/",
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
