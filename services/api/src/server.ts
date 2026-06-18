import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import type { Sql } from "@dip/core";
import { healthRoutes } from "./routes/health.js";
import { worklistRoutes } from "./routes/worklist.js";
import { recommendationRoutes } from "./routes/recommendation.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { metaRoutes } from "./routes/meta.js";

export interface RouteDeps {
  sql: Sql;
  jwtSecret: string;
}

export interface BuildServerOptions {
  sql: Sql;
  jwtSecret: string;
  corsOrigin?: string;
  logger?: boolean;
}

/** Build the Fastify app (also used by tests via app.inject). */
export function buildServer(opts: BuildServerOptions): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });

  void app.register(cors, { origin: opts.corsOrigin ?? true });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      void reply.code(400).send({ error: "validation", issues: err.issues });
      return;
    }
    request.log.error(err);
    void reply.code(500).send({ error: "internal" });
  });

  const deps: RouteDeps = { sql: opts.sql, jwtSecret: opts.jwtSecret };
  healthRoutes(app, deps);
  worklistRoutes(app, deps);
  recommendationRoutes(app, deps);
  feedbackRoutes(app, deps);
  metaRoutes(app, deps);

  return app;
}
