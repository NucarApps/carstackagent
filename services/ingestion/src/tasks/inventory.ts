import {
  toInventoryRow,
  toReconRow,
  toVdpRow,
  type InventoryRow,
  type ReconLineItemRow,
  type VdpEnrichmentRow,
} from "@dip/core";
import { recordEndpointError, type TaskContext } from "./context.js";
import { writeInventory, writeRecon, writeVdp } from "../snapshot.js";

/**
 * Inventory + the per-VIN fan-out. /inventory is the VIN source; for each VIN we
 * call /vdp-enrichment (throttled 240/min by the client) and /recon (line-item
 * fan-out). A 403 on a per-VIN endpoint disables it for the remaining VINs.
 */
export async function ingestInventory(ctx: TaskContext): Promise<void> {
  const { client, meta, report, sql } = ctx;

  let invItems;
  try {
    report.call("inventory");
    invItems = await client.list("inventory", { location_id: meta.locationId });
  } catch (err) {
    recordEndpointError(ctx, "inventory", err);
    return; // no VINs → nothing to enrich
  }

  const invRows = invItems
    .map((i) => toInventoryRow(i, meta))
    .filter((r): r is InventoryRow => r !== null);
  report.rows("inventory", await writeInventory(sql, invRows));

  const vdpRows: VdpEnrichmentRow[] = [];
  const reconRows: ReconLineItemRow[] = [];
  let vdpDisabled = false;
  let reconDisabled = false;

  for (const inv of invRows) {
    if (!vdpDisabled) {
      try {
        report.call("vdp-enrichment");
        const items = await client.getForVin("vdpEnrichment", meta.locationId, inv.vin);
        const first = items[0];
        if (first) vdpRows.push(toVdpRow(first, meta, inv.vin));
      } catch (err) {
        if (recordEndpointError(ctx, "vdp-enrichment", err)) vdpDisabled = true;
      }
    }
    if (!reconDisabled) {
      try {
        report.call("recon");
        const items = await client.getForVin("recon", meta.locationId, inv.vin);
        items.forEach((li, idx) => reconRows.push(toReconRow(li, meta, inv.vin, idx)));
      } catch (err) {
        if (recordEndpointError(ctx, "recon", err)) reconDisabled = true;
      }
    }
  }

  if (vdpRows.length) report.rows("vdp-enrichment", await writeVdp(sql, vdpRows));
  if (reconRows.length) report.rows("recon", await writeRecon(sql, reconRows));
}
