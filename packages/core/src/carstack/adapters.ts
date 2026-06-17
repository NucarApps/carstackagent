import type { RawCarstackItem } from "../types/carstack.js";
import type {
  AppointmentRow,
  DealRow,
  InventoryRow,
  LeadRow,
  RegistrationRow,
  ReconLineItemRow,
  SalesMarketRow,
  VdpEnrichmentRow,
} from "../types/domain.js";

/**
 * Tolerant raw→normalized mappers. They never throw: unknown fields are kept
 * verbatim in `payload`, missing fields become null, and several common key
 * spellings are accepted. When the real CarStack spec lands, the field-key
 * lists below are the single place to correct (with endpoints.ts).
 */

export interface AdapterMeta {
  snapshotDate: string;
  locationId: string;
  sourceRunId: string;
}

// ---- coercion helpers -----------------------------------------------------

function pick(item: RawCarstackItem, keys: string[]): unknown {
  for (const k of keys) {
    if (item[k] !== undefined && item[k] !== null) return item[k];
  }
  return undefined;
}

function str(item: RawCarstackItem, keys: string[]): string | null {
  const v = pick(item, keys);
  if (v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function num(item: RawCarstackItem, keys: string[]): number | null {
  const v = pick(item, keys);
  if (v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[$,]/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function int(item: RawCarstackItem, keys: string[]): number | null {
  const n = num(item, keys);
  return n === null ? null : Math.trunc(n);
}

function bool(item: RawCarstackItem, keys: string[]): boolean | null {
  const v = pick(item, keys);
  if (v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    if (["true", "yes", "y", "1"].includes(v.toLowerCase())) return true;
    if (["false", "no", "n", "0"].includes(v.toLowerCase())) return false;
  }
  if (typeof v === "number") return v !== 0;
  return null;
}

function dateStr(item: RawCarstackItem, keys: string[]): string | null {
  const v = pick(item, keys);
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Deterministic fallback id (djb2) so rows without a source id stay idempotent. */
function stableId(item: RawCarstackItem): string {
  const s = JSON.stringify(item);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `auto-${h.toString(16)}`;
}

// ---- adapters -------------------------------------------------------------

export function toInventoryRow(
  item: RawCarstackItem,
  meta: AdapterMeta,
): InventoryRow | null {
  const vin = str(item, ["vin", "VIN", "vehicle_vin"]);
  if (!vin) return null;
  return {
    ...meta,
    payload: item,
    vin,
    stockNumber: str(item, ["stock_number", "stockNumber", "stock"]),
    make: str(item, ["make", "Make"]),
    model: str(item, ["model", "Model"]),
    modelYear: int(item, ["model_year", "year", "modelYear"]),
    mileage: int(item, ["mileage", "odometer", "miles"]),
    listPrice: num(item, ["list_price", "price", "asking_price", "listPrice"]),
    cost: num(item, ["cost", "unit_cost", "acv"]),
    status: str(item, ["status", "inventory_status"]),
    condition: str(item, ["condition", "type", "new_used"]),
    firstSeenHint: dateStr(item, ["first_seen", "date_in_inventory", "stocked_at"]),
  };
}

export function toVdpRow(
  item: RawCarstackItem,
  meta: AdapterMeta,
  vin: string,
): VdpEnrichmentRow {
  return {
    ...meta,
    payload: item,
    vin,
    vdpViews: int(item, ["vdp_views", "vdpViews", "views"]),
    photoCount: int(item, ["photo_count", "photos", "photoCount"]),
    priceChangedFlag: bool(item, ["price_changed", "priceChanged", "price_change"]),
  };
}

export function toReconRow(
  item: RawCarstackItem,
  meta: AdapterMeta,
  vin: string,
  index: number,
): ReconLineItemRow {
  const lineItemId =
    str(item, ["line_item_id", "id", "lineItemId"]) ?? `${vin}:${index}`;
  return {
    ...meta,
    payload: item,
    vin,
    lineItemId,
    description: str(item, ["description", "desc", "name", "op_code"]),
    cost: num(item, ["cost", "amount", "price"]),
    status: str(item, ["status", "state"]),
  };
}

export function toSalesMarketRow(
  item: RawCarstackItem,
  meta: AdapterMeta,
): SalesMarketRow | null {
  const make = str(item, ["make", "Make"]);
  if (!make) return null;
  return {
    ...meta,
    payload: item,
    make,
    units: num(item, ["units", "count", "sales"]),
    share: num(item, ["share", "market_share", "pct"]),
  };
}

export function toRegistrationRow(
  item: RawCarstackItem,
  meta: AdapterMeta,
): RegistrationRow | null {
  const make = str(item, ["make", "Make"]);
  const model = str(item, ["model", "Model"]);
  if (!make || !model) return null;
  return {
    ...meta,
    payload: item,
    make,
    model,
    modelYear: int(item, ["model_year", "year", "modelYear"]),
    units: num(item, ["units", "count", "registrations"]),
  };
}

export function toLeadRow(item: RawCarstackItem, meta: AdapterMeta): LeadRow {
  const leadId = str(item, ["lead_id", "id", "leadId"]) ?? stableId(item);
  return {
    ...meta,
    payload: item,
    leadId,
    customerName: str(item, ["customer_name", "name", "full_name"]),
    city: str(item, ["city"]),
    state: str(item, ["state", "region"]),
    source: str(item, ["source", "lead_source", "channel"]),
    status: str(item, ["status", "lead_status"]),
    make: str(item, ["make", "interest_make"]),
    model: str(item, ["model", "interest_model"]),
    createdHint: dateStr(item, ["created_at", "created", "date"]),
  };
}

export function toDealRow(item: RawCarstackItem, meta: AdapterMeta): DealRow {
  const dealId = str(item, ["deal_id", "id", "dealId"]) ?? stableId(item);
  return {
    ...meta,
    payload: item,
    dealId,
    customerName: str(item, ["customer_name", "name", "full_name"]),
    city: str(item, ["city"]),
    state: str(item, ["state", "region"]),
    vin: str(item, ["vin", "VIN"]),
    soldDate: dateStr(item, ["sold_date", "soldDate", "date", "closed_at"]),
  };
}

export function toAppointmentRow(
  item: RawCarstackItem,
  meta: AdapterMeta,
): AppointmentRow {
  const appointmentId =
    str(item, ["appointment_id", "id", "appointmentId"]) ?? stableId(item);
  return {
    ...meta,
    payload: item,
    appointmentId,
    customerName: str(item, ["customer_name", "name", "full_name"]),
    city: str(item, ["city"]),
    state: str(item, ["state", "region"]),
    apptDate: dateStr(item, ["appt_date", "appointment_date", "date", "scheduled_at"]),
  };
}
