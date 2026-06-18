import {
  toRegistrationRow,
  toSalesMarketRow,
  type RegistrationRow,
  type SalesMarketRow,
} from "@dip/core";
import { recordEndpointError, type TaskContext } from "./context.js";
import { writeRegistration, writeSalesMarket } from "../snapshot.js";

/**
 * Polk via the API path (Rule 2): make-level /sales-market and model-level
 * /registration — PMA-scoped server-side, no geo/segment/trim. Geo/segment
 * analysis reads the owned table via the core PostGIS views, NOT here.
 */
export async function ingestMarket(ctx: TaskContext): Promise<void> {
  const { client, meta, report, sql } = ctx;

  try {
    report.call("sales-market");
    const items = await client.list("salesMarket", { location_id: meta.locationId });
    const rows = items
      .map((i) => toSalesMarketRow(i, meta))
      .filter((r): r is SalesMarketRow => r !== null);
    report.rows("sales-market", await writeSalesMarket(sql, rows));
  } catch (err) {
    recordEndpointError(ctx, "sales-market", err);
  }

  try {
    report.call("registration");
    const items = await client.list("registration", { location_id: meta.locationId });
    const rows = items
      .map((i) => toRegistrationRow(i, meta))
      .filter((r): r is RegistrationRow => r !== null);
    report.rows("registration", await writeRegistration(sql, rows));
  } catch (err) {
    recordEndpointError(ctx, "registration", err);
  }
}
