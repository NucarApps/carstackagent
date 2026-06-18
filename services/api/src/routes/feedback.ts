import type { FastifyInstance } from "fastify";
import { feedbackRequestSchema, recRepo } from "@dip/core";
import { resolveActor } from "../auth.js";
import type { RouteDeps } from "../server.js";

/** POST /recommendations/:id/feedback — accept / dismiss / snooze (+ outcome). */
export function feedbackRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.post("/recommendations/:id/feedback", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = feedbackRequestSchema.parse(request.body);
    const actor = resolveActor(request, deps.jwtSecret);

    const ok = await recRepo.recordFeedback(deps.sql, {
      recommendationId: id,
      action: body.action,
      reason: body.reason ?? null,
      snoozeUntil: body.snoozeUntil ?? null,
      outcome: body.outcome ?? null,
      outcomeDollars: body.outcomeDollars ?? null,
      actorRole: actor.role,
      actorEmail: actor.email,
    });
    if (!ok) {
      reply.code(404);
      return { error: "not_found" };
    }
    return { ok: true };
  });
}
