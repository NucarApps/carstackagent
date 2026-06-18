import type { FastifyInstance } from "fastify";
import { recRepo, worklistQuerySchema, worklistResponseSchema } from "@dip/core";
import { effectiveRole, resolveActor } from "../auth.js";
import type { RouteDeps } from "../server.js";

/** GET /worklist — dollar-ranked open recommendations for a role + store. */
export function worklistRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get("/worklist", async (request) => {
    const q = worklistQuerySchema.parse(request.query);
    const actor = resolveActor(request, deps.jwtSecret);
    const role = effectiveRole(actor, q.role);

    const items = await recRepo.getWorklist(deps.sql, {
      role,
      locationId: q.location_id,
      limit: q.limit,
      cursor: q.cursor,
    });
    const nextCursor = items.length === q.limit ? q.cursor + q.limit : null;
    return worklistResponseSchema.parse({ items, nextCursor });
  });
}
