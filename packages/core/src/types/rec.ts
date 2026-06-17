import { z } from "zod";

/**
 * The agent output contract. Every agent writes rec.recommendation rows with a
 * dedupe_key and owner_role. These Zod schemas validate at the DB boundary and
 * are the single source of truth for the recommendation shape.
 */

export const recommendationStatusSchema = z.enum([
  "open",
  "superseded",
  "accepted",
  "dismissed",
  "snoozed",
  "expired",
]);
export type RecommendationStatus = z.infer<typeof recommendationStatusSchema>;

export const subjectTypeSchema = z.enum([
  "vin",
  "make_model",
  "customer",
  "segment",
]);
export type SubjectType = z.infer<typeof subjectTypeSchema>;

export const ownerRoleSchema = z.enum([
  "gm",
  "used_car_mgr",
  "new_car_mgr",
  "sales_mgr",
  "bdc_mgr",
  "inventory_mgr",
  "finance_mgr",
  "marketing_mgr",
]);
export type OwnerRole = z.infer<typeof ownerRoleSchema>;

export const feedbackActionSchema = z.enum(["accept", "dismiss", "snooze"]);
export type FeedbackAction = z.infer<typeof feedbackActionSchema>;

/** A recommendation as written to / read from rec.recommendation. */
export const recommendationSchema = z.object({
  recommendationId: z.string().uuid(),
  agent: z.string(),
  recType: z.string(),
  ownerRole: ownerRoleSchema,
  locationId: z.string(),
  subjectType: subjectTypeSchema,
  subjectId: z.string(),
  dedupeKey: z.string(),
  issue: z.string(),
  evidence: z.record(z.string(), z.unknown()),
  action: z.string(),
  rationale: z.string(),
  expectedDollarImpact: z.number(),
  confidence: z.number().min(0).max(1),
  status: recommendationStatusSchema,
  snoozeUntil: z.string().nullable(),
  generatedRunId: z.string().uuid().nullable(),
  createdAt: z.string(),
  supersededBy: z.string().uuid().nullable(),
});
export type Recommendation = z.infer<typeof recommendationSchema>;

/** What an agent hands to the DB writer before ids/status are assigned. */
export const recommendationDraftSchema = recommendationSchema.pick({
  agent: true,
  recType: true,
  ownerRole: true,
  locationId: true,
  subjectType: true,
  subjectId: true,
  dedupeKey: true,
  issue: true,
  evidence: true,
  action: true,
  rationale: true,
  expectedDollarImpact: true,
  confidence: true,
});
export type RecommendationDraft = z.infer<typeof recommendationDraftSchema>;

export interface RecommendationFeedback {
  feedbackId: string;
  recommendationId: string;
  action: FeedbackAction;
  reason: string | null;
  snoozeUntil: string | null;
  outcome: string | null;
  outcomeDollars: number | null;
  actorRole: string | null;
  actorEmail: string | null;
  createdAt: string;
}
