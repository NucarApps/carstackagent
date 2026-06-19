import { defineTool } from "eve/tools";
import { z } from "zod";
import { createSql } from "@dip/core";
// Reuse the existing deterministic pricing trigger + calibration loader.
import { pricingAgent } from "@dip/agents/dist/agents/pricing.js";
import { loadParams } from "@dip/agents/dist/framework/calibration.js";
import { setFlagged } from "../lib/cache.js";

/**
 * Runs the deterministic pricing trigger SQL for one store and returns the
 * pre-aggregated numbers the model may reason over (it must not compute new
 * ones). Caches the full rows (incl. the SQL-computed baseImpact) for
 * write_recommendation.
 */
export default defineTool({
  description:
    "Flag aged/unpriced units for a store and return the SQL-computed evidence per subject.",
  inputSchema: z.object({ locationId: z.string().min(1) }),
  async execute({ locationId }) {
    const sql = createSql({ max: 2 });
    try {
      const params = await loadParams(sql, pricingAgent, locationId);
      const rows = await pricingAgent.trigger({ sql, locationId, params });
      setFlagged(locationId, rows);
      return rows.map((r) => ({
        subjectId: r.subjectId,
        subject: r.subjectLabel,
        evidence: { ...r.evidence, expected_dollar_impact: r.baseImpact },
      }));
    } finally {
      await sql.end();
    }
  },
});
