import { defineSchedule } from "eve/schedules";
import { createSql, refRepo } from "@dip/core";

/**
 * Nightly run: for each active store, ask the agent to flag pricing issues and
 * write a recommendation per flagged unit. Durable execution means a crash/deploy
 * mid-run resumes where it stopped.
 *
 * NOTE: Eve is beta — confirm the defineSchedule / agent-invocation signature
 * against the current docs; the per-location loop + prompt is the intent.
 */
export default defineSchedule({
  cron: "30 3 * * *",
  async run({ agent }) {
    const sql = createSql({ max: 2 });
    try {
      const locations = await refRepo.getActiveLocations(sql);
      for (const loc of locations) {
        await agent.run(
          `Store ${loc.locationId} (${loc.storeName}): call flag_subjects for this ` +
            `location, then call write_recommendation once for each flagged unit.`,
        );
      }
    } finally {
      await sql.end();
    }
  },
});
