/**
 * Normalized domain rows. The CarStack adapters produce these from raw API
 * objects; the ingestion snapshot writer persists them into raw.* alongside the
 * verbatim payload. Every row carries the snapshot grain (snapshot_date,
 * location_id, natural key). Per Rule 3, no `trim` exists anywhere here.
 */

export interface SnapshotMeta {
  snapshotDate: string; // YYYY-MM-DD
  locationId: string;
  sourceRunId: string;
  /** Verbatim source object — the escape hatch for unknown/mis-mapped fields. */
  payload: unknown;
}

export interface InventoryRow extends SnapshotMeta {
  vin: string;
  stockNumber: string | null;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  mileage: number | null;
  listPrice: number | null;
  cost: number | null;
  status: string | null;
  condition: string | null;
  firstSeenHint: string | null; // YYYY-MM-DD if the source provides one
}

export interface VdpEnrichmentRow extends SnapshotMeta {
  vin: string;
  vdpViews: number | null;
  photoCount: number | null;
  priceChangedFlag: boolean | null;
}

export interface ReconLineItemRow extends SnapshotMeta {
  vin: string;
  lineItemId: string;
  description: string | null;
  cost: number | null;
  status: string | null;
}

export interface SalesMarketRow extends SnapshotMeta {
  // Make-level, PMA-scoped via API (Rule 2): no geo, no segment, no trim.
  make: string;
  units: number | null;
  share: number | null;
}

export interface RegistrationRow extends SnapshotMeta {
  // Model-level, PMA-scoped via API (Rule 2/3): make/model/model_year only.
  make: string;
  model: string;
  modelYear: number | null;
  units: number | null;
}

export interface LeadRow extends SnapshotMeta {
  leadId: string;
  customerName: string | null;
  city: string | null;
  state: string | null;
  source: string | null;
  status: string | null;
  make: string | null;
  model: string | null;
  createdHint: string | null;
}

export interface DealRow extends SnapshotMeta {
  dealId: string;
  customerName: string | null;
  city: string | null;
  state: string | null;
  vin: string | null;
  soldDate: string | null;
}

export interface AppointmentRow extends SnapshotMeta {
  appointmentId: string;
  customerName: string | null;
  city: string | null;
  state: string | null;
  apptDate: string | null;
}

/** Discriminated union of every normalized row a task can emit. */
export type NormalizedRow =
  | InventoryRow
  | VdpEnrichmentRow
  | ReconLineItemRow
  | SalesMarketRow
  | RegistrationRow
  | LeadRow
  | DealRow
  | AppointmentRow;
