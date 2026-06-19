import { defineTool } from "eve/tools";
import { z } from "zod";
import { createSql, recRepo } from "@dip/core";
import { pricingAgent } from "@dip/agents/dist/agents/pricing.js";
import { getFlagged } from "../lib/cache.js";

/**
 * Writes one recommendation to the rec.recommendation contract. The dollar
 * impact and evidence come from the SQL-flagged row (the model never sets
 * numbers); the model supplies only issue/action/rationale/confidence. The
 * partial-unique index keeps one OPEN recommendation per dedupe_key.
 */
export default defineTool({
  description:
    "Record a pricing recommendation for a flagged subject. The $ impact is the SQL-computed value; you do not set it.",
  inputSchema: z.object({
    locationId: z.string().min(1),
    subjectId: z.string().min(1),
    issue: z.string().min(1),
    action: z.string().min(1),
    rationale: z.string().min(1),
    confidence: z.number().min(0).max(1),
  }),
  async execute({ locationId, subjectId, issue, action, rationale, confidence }) {
    const row = getFlagged(locationId, subjectId);
    if (!row) {
      return { ok: false, error: "Unknown subject — call flag_subjects first." };
    }
    const sql = createSql({ max: 2 });
    try {
      const recommendationId = await recRepo.insertOrRefreshRecommendation(
        sql,
        {
          agent: pricingAgent.name,
          recType: pricingAgent.recType,
          ownerRole: pricingAgent.ownerRole,
          locationId,
          subjectType: pricingAgent.subjectType,
          subjectId,
          dedupeKey: `${pricingAgent.recType}:${locationId}:${pricingAgent.subjectType}:${subjectId}`,
          issue,
          evidence: { ...row.evidence, subject: row.subjectLabel, expected_dollar_impact: row.baseImpact },
          action,
          rationale,
          expectedDollarImpact: row.baseImpact, // SQL wins — the model never sets numbers
          confidence,
        },
        null,
      );
      return { ok: true, recommendationId };
    } finally {
      await sql.end();
    }
  },
});
