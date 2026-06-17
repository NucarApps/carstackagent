import type { Sql } from "../client.js";

/** Reads/operations against the derived core.* layer. */

/**
 * (Re)build core.entity_customer / core.customer_match from the latest
 * lead/deal/appointment snapshots (Rule 4 — fuzzy identity). Ingestion calls
 * this after writing raw.*. The matching logic lives entirely in the SQL
 * function so an upgrade to an exact CarStack id is a one-place change.
 */
export async function resolveCustomers(sql: Sql): Promise<number> {
  const rows = await sql<{ resolved: number }[]>`
    select core.fn_resolve_customers() as resolved
  `;
  return Number(rows[0]?.resolved ?? 0);
}

/** Map of ext feed -> ready (drives agent fail-soft, Rule 5). */
export async function getFeedReadiness(
  sql: Sql,
): Promise<Record<string, boolean>> {
  const rows = await sql<{ feed: string; ready: boolean }[]>`
    select feed, ready from ext.v_feed_readiness
  `;
  const out: Record<string, boolean> = {};
  for (const r of rows) out[r.feed] = r.ready;
  return out;
}
