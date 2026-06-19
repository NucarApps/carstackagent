import type { Sql } from "@dip/core";

/**
 * Insert helpers for DB integration tests. They write raw snapshot rows
 * directly so a test can build a multi-day snapshot series and assert the
 * derived core.* views (days-on-lot, price changes, velocity, customer
 * resolution). Sensible defaults keep call sites terse.
 */

export interface InventoryInput {
  snapshotDate: string;
  locationId?: string;
  vin: string;
  listPrice?: number | null;
  make?: string;
  model?: string;
  modelYear?: number;
  firstSeenHint?: string | null;
  status?: string;
}

export async function insertInventory(sql: Sql, i: InventoryInput): Promise<void> {
  await sql`
    insert into raw.inventory_snapshot
      (snapshot_date, location_id, vin, make, model, model_year, list_price,
       status, first_seen_hint, payload)
    values (
      ${i.snapshotDate}, ${i.locationId ?? "NUCAR-01"}, ${i.vin},
      ${i.make ?? "Toyota"}, ${i.model ?? "RAV4"}, ${i.modelYear ?? 2022},
      ${i.listPrice ?? 30000}, ${i.status ?? "available"},
      ${i.firstSeenHint ?? null}, ${sql.json({ vin: i.vin } as never)}
    )
    on conflict (snapshot_date, location_id, vin) do update set
      list_price = excluded.list_price,
      first_seen_hint = excluded.first_seen_hint
  `;
}

export interface DealInput {
  snapshotDate: string;
  locationId?: string;
  dealId: string;
  vin: string;
  soldDate: string;
  customerName?: string;
  city?: string;
  state?: string;
}

export async function insertDeal(sql: Sql, d: DealInput): Promise<void> {
  await sql`
    insert into raw.deal_snapshot
      (snapshot_date, location_id, deal_id, customer_name, city, state, vin, sold_date, payload)
    values (
      ${d.snapshotDate}, ${d.locationId ?? "NUCAR-01"}, ${d.dealId},
      ${d.customerName ?? "Test Buyer"}, ${d.city ?? "Wilmington"},
      ${d.state ?? "DE"}, ${d.vin}, ${d.soldDate}, ${sql.json({ deal: d.dealId } as never)}
    )
    on conflict (snapshot_date, location_id, deal_id) do nothing
  `;
}

export interface LeadInput {
  snapshotDate: string;
  locationId?: string;
  leadId: string;
  customerName: string;
  city?: string;
  state?: string;
  createdHint?: string;
}

export async function insertLead(sql: Sql, l: LeadInput): Promise<void> {
  await sql`
    insert into raw.lead_snapshot
      (snapshot_date, location_id, lead_id, customer_name, city, state, created_hint, payload)
    values (
      ${l.snapshotDate}, ${l.locationId ?? "NUCAR-01"}, ${l.leadId},
      ${l.customerName}, ${l.city ?? "Wilmington"}, ${l.state ?? "DE"},
      ${l.createdHint ?? l.snapshotDate}, ${sql.json({ lead: l.leadId } as never)}
    )
    on conflict (snapshot_date, location_id, lead_id) do nothing
  `;
}

export interface AppointmentInput {
  snapshotDate: string;
  locationId?: string;
  appointmentId: string;
  customerName: string;
  city?: string;
  state?: string;
  apptDate?: string;
}

export async function insertAppointment(sql: Sql, a: AppointmentInput): Promise<void> {
  await sql`
    insert into raw.appointment_snapshot
      (snapshot_date, location_id, appointment_id, customer_name, city, state, appt_date, payload)
    values (
      ${a.snapshotDate}, ${a.locationId ?? "NUCAR-01"}, ${a.appointmentId},
      ${a.customerName}, ${a.city ?? "Wilmington"}, ${a.state ?? "DE"},
      ${a.apptDate ?? a.snapshotDate}, ${sql.json({ appt: a.appointmentId } as never)}
    )
    on conflict (snapshot_date, location_id, appointment_id) do nothing
  `;
}
