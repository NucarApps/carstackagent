import { z } from "zod";
import {
  feedbackActionSchema,
  ownerRoleSchema,
  subjectTypeSchema,
} from "./rec.js";

/**
 * Shared web↔api DTOs. Both `@dip/api` (route validation) and `@dip/web` (typed
 * client) import these, so the contract cannot drift. The web bundle imports
 * only this module from @dip/core — it never pulls in postgres/fastify/anthropic.
 */

export const worklistItemSchema = z.object({
  recommendationId: z.string().uuid(),
  rank: z.number().int(),
  agent: z.string(),
  recType: z.string(),
  ownerRole: ownerRoleSchema,
  locationId: z.string(),
  subjectType: subjectTypeSchema,
  subjectId: z.string(),
  issue: z.string(),
  action: z.string(),
  expectedDollarImpact: z.number(),
  confidence: z.number().min(0).max(1),
  createdAt: z.string(),
});
export type WorklistItem = z.infer<typeof worklistItemSchema>;

export const worklistQuerySchema = z.object({
  role: ownerRoleSchema.optional(),
  location_id: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  cursor: z.coerce.number().int().min(0).default(0),
});
export type WorklistQuery = z.infer<typeof worklistQuerySchema>;

export const worklistResponseSchema = z.object({
  items: z.array(worklistItemSchema),
  nextCursor: z.number().int().nullable(),
});
export type WorklistResponse = z.infer<typeof worklistResponseSchema>;

export const recommendationDetailSchema = z.object({
  recommendationId: z.string().uuid(),
  agent: z.string(),
  recType: z.string(),
  ownerRole: ownerRoleSchema,
  locationId: z.string(),
  subjectType: subjectTypeSchema,
  subjectId: z.string(),
  issue: z.string(),
  evidence: z.record(z.string(), z.unknown()),
  action: z.string(),
  rationale: z.string(),
  expectedDollarImpact: z.number(),
  confidence: z.number().min(0).max(1),
  status: z.string(),
  createdAt: z.string(),
  supersededBy: z.string().uuid().nullable(),
  feedback: z.array(
    z.object({
      action: feedbackActionSchema,
      reason: z.string().nullable(),
      outcome: z.string().nullable(),
      outcomeDollars: z.number().nullable(),
      actorRole: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type RecommendationDetail = z.infer<typeof recommendationDetailSchema>;

export const feedbackRequestSchema = z
  .object({
    action: feedbackActionSchema,
    reason: z.string().max(2000).optional(),
    snoozeUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
      .optional(),
    outcome: z.string().max(200).optional(),
    outcomeDollars: z.number().optional(),
  })
  .refine((v) => v.action !== "snooze" || !!v.snoozeUntil, {
    message: "snoozeUntil is required when action is 'snooze'",
    path: ["snoozeUntil"],
  });
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;

export const roleMetaSchema = z.object({
  ownerRole: ownerRoleSchema,
  displayName: z.string(),
  sortOrder: z.number().int(),
});
export type RoleMeta = z.infer<typeof roleMetaSchema>;

export const locationMetaSchema = z.object({
  locationId: z.string(),
  storeName: z.string(),
  rooftopCode: z.string().nullable(),
});
export type LocationMeta = z.infer<typeof locationMetaSchema>;
