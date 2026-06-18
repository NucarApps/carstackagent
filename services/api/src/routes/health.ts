import type { FastifyInstance } from "fastify";
import type { RouteDeps } from "../server.js";

export function healthRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get("/healthz", async () => ({ status: "ok" }));

  app.get("/readyz", async (_request, reply) => {
    try {
      await deps.sql`select 1`;
      return { status: "ready" };
    } catch {
      reply.code(503);
      return { status: "unavailable" };
    }
  });
}
