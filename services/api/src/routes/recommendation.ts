import type { FastifyInstance } from "fastify";
import { recommendationDetailSchema, recRepo } from "@dip/core";
import type { RouteDeps } from "../server.js";

/** GET /recommendations/:id — full detail incl. the evidence the model saw. */
export function recommendationRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get("/recommendations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const detail = await recRepo.getRecommendationDetail(deps.sql, id);
    if (!detail) {
      reply.code(404);
      return { error: "not_found" };
    }
    return recommendationDetailSchema.parse(detail);
  });
}
