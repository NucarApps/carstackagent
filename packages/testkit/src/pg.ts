import { createSql, type Sql } from "@dip/core";

/** Postgres test harness against the migrated dip database (DATABASE_URL). */

export function getTestSql(): Sql {
  return createSql({ max: 2 });
}

/** Wipe raw + derived-customer + rec data, preserving ref/ext seeds + calibration. */
export async function resetData(sql: Sql): Promise<void> {
  await sql.unsafe(`
    truncate
      raw.inventory_snapshot, raw.vdp_enrichment_snapshot, raw.recon_line_item,
      raw.sales_market_snapshot, raw.registration_snapshot,
      raw.lead_snapshot, raw.deal_snapshot, raw.appointment_snapshot,
      raw.ingestion_run
      restart identity cascade
  `);
  await sql.unsafe(`
    truncate core.customer_match, core.entity_customer restart identity cascade
  `);
  await sql.unsafe(`
    truncate rec.worklist, rec.recommendation_feedback, rec.recommendation
      restart identity cascade
  `);
}

/** Remove only recommendation/worklist/feedback (keeps raw + customers). */
export async function resetRecommendations(sql: Sql): Promise<void> {
  await sql.unsafe(`
    truncate rec.worklist, rec.recommendation_feedback, rec.recommendation
      restart identity cascade
  `);
}
