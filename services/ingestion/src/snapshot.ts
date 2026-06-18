import { rawRepo, type Sql } from "@dip/core";
import type {
  AppointmentRow,
  DealRow,
  InventoryRow,
  LeadRow,
  RegistrationRow,
  ReconLineItemRow,
  SalesMarketRow,
  VdpEnrichmentRow,
} from "@dip/core";

/**
 * Idempotent daily snapshot writers (Rule 1). Each maps the normalized domain
 * row to its snake_case raw.* columns and upserts on the snapshot grain so a
 * same-day re-run updates in place rather than duplicating.
 */

const META_UPDATE = ["ingested_at", "source_run_id", "payload"] as const;

export function writeInventory(sql: Sql, rows: InventoryRow[]): Promise<number> {
  return rawRepo.upsertSnapshot(sql, {
    schema: "raw",
    table: "inventory_snapshot",
    conflictColumns: ["snapshot_date", "location_id", "vin"],
    updateColumns: [
      "stock_number", "make", "model", "model_year", "mileage", "list_price",
      "cost", "status", "condition", "first_seen_hint", ...META_UPDATE,
    ],
    rows: rows.map((r) => ({
      snapshot_date: r.snapshotDate,
      location_id: r.locationId,
      vin: r.vin,
      stock_number: r.stockNumber,
      make: r.make,
      model: r.model,
      model_year: r.modelYear,
      mileage: r.mileage,
      list_price: r.listPrice,
      cost: r.cost,
      status: r.status,
      condition: r.condition,
      first_seen_hint: r.firstSeenHint,
      ingested_at: new Date(),
      source_run_id: r.sourceRunId,
      payload: r.payload,
    })),
  });
}

export function writeVdp(sql: Sql, rows: VdpEnrichmentRow[]): Promise<number> {
  return rawRepo.upsertSnapshot(sql, {
    schema: "raw",
    table: "vdp_enrichment_snapshot",
    conflictColumns: ["snapshot_date", "location_id", "vin"],
    updateColumns: ["vdp_views", "photo_count", "price_changed_flag", ...META_UPDATE],
    rows: rows.map((r) => ({
      snapshot_date: r.snapshotDate,
      location_id: r.locationId,
      vin: r.vin,
      vdp_views: r.vdpViews,
      photo_count: r.photoCount,
      price_changed_flag: r.priceChangedFlag,
      ingested_at: new Date(),
      source_run_id: r.sourceRunId,
      payload: r.payload,
    })),
  });
}

export function writeRecon(sql: Sql, rows: ReconLineItemRow[]): Promise<number> {
  return rawRepo.upsertSnapshot(sql, {
    schema: "raw",
    table: "recon_line_item",
    conflictColumns: ["snapshot_date", "location_id", "vin", "line_item_id"],
    updateColumns: ["description", "cost", "status", ...META_UPDATE],
    rows: rows.map((r) => ({
      snapshot_date: r.snapshotDate,
      location_id: r.locationId,
      vin: r.vin,
      line_item_id: r.lineItemId,
      description: r.description,
      cost: r.cost,
      status: r.status,
      ingested_at: new Date(),
      source_run_id: r.sourceRunId,
      payload: r.payload,
    })),
  });
}

export function writeSalesMarket(sql: Sql, rows: SalesMarketRow[]): Promise<number> {
  return rawRepo.upsertSnapshot(sql, {
    schema: "raw",
    table: "sales_market_snapshot",
    conflictColumns: ["snapshot_date", "location_id", "make"],
    updateColumns: ["units", "share", ...META_UPDATE],
    rows: rows.map((r) => ({
      snapshot_date: r.snapshotDate,
      location_id: r.locationId,
      make: r.make,
      units: r.units,
      share: r.share,
      ingested_at: new Date(),
      source_run_id: r.sourceRunId,
      payload: r.payload,
    })),
  });
}

export function writeRegistration(sql: Sql, rows: RegistrationRow[]): Promise<number> {
  return rawRepo.upsertSnapshot(sql, {
    schema: "raw",
    table: "registration_snapshot",
    conflictColumns: ["snapshot_date", "location_id", "make", "model", "model_year"],
    updateColumns: ["units", ...META_UPDATE],
    rows: rows.map((r) => ({
      snapshot_date: r.snapshotDate,
      location_id: r.locationId,
      make: r.make,
      model: r.model,
      model_year: r.modelYear ?? 0, // 0 = unknown year (must be non-null for the PK)
      units: r.units,
      ingested_at: new Date(),
      source_run_id: r.sourceRunId,
      payload: r.payload,
    })),
  });
}

export function writeLeads(sql: Sql, rows: LeadRow[]): Promise<number> {
  return rawRepo.upsertSnapshot(sql, {
    schema: "raw",
    table: "lead_snapshot",
    conflictColumns: ["snapshot_date", "location_id", "lead_id"],
    updateColumns: [
      "customer_name", "city", "state", "source", "status", "make", "model",
      "created_hint", ...META_UPDATE,
    ],
    rows: rows.map((r) => ({
      snapshot_date: r.snapshotDate,
      location_id: r.locationId,
      lead_id: r.leadId,
      customer_name: r.customerName,
      city: r.city,
      state: r.state,
      source: r.source,
      status: r.status,
      make: r.make,
      model: r.model,
      created_hint: r.createdHint,
      ingested_at: new Date(),
      source_run_id: r.sourceRunId,
      payload: r.payload,
    })),
  });
}

export function writeDeals(sql: Sql, rows: DealRow[]): Promise<number> {
  return rawRepo.upsertSnapshot(sql, {
    schema: "raw",
    table: "deal_snapshot",
    conflictColumns: ["snapshot_date", "location_id", "deal_id"],
    updateColumns: ["customer_name", "city", "state", "vin", "sold_date", ...META_UPDATE],
    rows: rows.map((r) => ({
      snapshot_date: r.snapshotDate,
      location_id: r.locationId,
      deal_id: r.dealId,
      customer_name: r.customerName,
      city: r.city,
      state: r.state,
      vin: r.vin,
      sold_date: r.soldDate,
      ingested_at: new Date(),
      source_run_id: r.sourceRunId,
      payload: r.payload,
    })),
  });
}

export function writeAppointments(sql: Sql, rows: AppointmentRow[]): Promise<number> {
  return rawRepo.upsertSnapshot(sql, {
    schema: "raw",
    table: "appointment_snapshot",
    conflictColumns: ["snapshot_date", "location_id", "appointment_id"],
    updateColumns: ["customer_name", "city", "state", "appt_date", ...META_UPDATE],
    rows: rows.map((r) => ({
      snapshot_date: r.snapshotDate,
      location_id: r.locationId,
      appointment_id: r.appointmentId,
      customer_name: r.customerName,
      city: r.city,
      state: r.state,
      appt_date: r.apptDate,
      ingested_at: new Date(),
      source_run_id: r.sourceRunId,
      payload: r.payload,
    })),
  });
}
