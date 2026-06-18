import {
  toAppointmentRow,
  toDealRow,
  toLeadRow,
} from "@dip/core";
import { recordEndpointError, type TaskContext } from "./context.js";
import { writeAppointments, writeDeals, writeLeads } from "../snapshot.js";

/**
 * CRM snapshots: /leads, /deals, /appointments. Customer identity is fuzzy
 * (Rule 4) — these carry name + city/state only (leads no VIN); resolution
 * happens after ingestion via core.fn_resolve_customers().
 */
export async function ingestCrm(ctx: TaskContext): Promise<void> {
  const { client, meta, report, sql } = ctx;

  try {
    report.call("leads");
    const items = await client.list("leads", { location_id: meta.locationId });
    const rows = items.map((i) => toLeadRow(i, meta));
    report.rows("leads", await writeLeads(sql, rows));
  } catch (err) {
    recordEndpointError(ctx, "leads", err);
  }

  try {
    report.call("deals");
    const items = await client.list("deals", { location_id: meta.locationId });
    const rows = items.map((i) => toDealRow(i, meta));
    report.rows("deals", await writeDeals(sql, rows));
  } catch (err) {
    recordEndpointError(ctx, "deals", err);
  }

  try {
    report.call("appointments");
    const items = await client.list("appointments", { location_id: meta.locationId });
    const rows = items.map((i) => toAppointmentRow(i, meta));
    report.rows("appointments", await writeAppointments(sql, rows));
  } catch (err) {
    recordEndpointError(ctx, "appointments", err);
  }
}
