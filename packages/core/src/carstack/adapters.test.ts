import { describe, expect, it } from "vitest";
import {
  toInventoryRow,
  toReconRow,
  toLeadRow,
  type AdapterMeta,
} from "./adapters.js";

const meta: AdapterMeta = {
  snapshotDate: "2026-06-18",
  locationId: "NUCAR-01",
  sourceRunId: "run-1",
};

describe("CarStack adapters (tolerant)", () => {
  it("maps an inventory item and accepts alternate key spellings", () => {
    const row = toInventoryRow(
      { VIN: "ABC123", price: "$24,500", year: 2022, make: "Toyota", model: "RAV4" },
      meta,
    );
    expect(row).not.toBeNull();
    expect(row?.vin).toBe("ABC123");
    expect(row?.listPrice).toBe(24500); // "$24,500" cleaned to number
    expect(row?.modelYear).toBe(2022);
    expect(row?.payload).toEqual({
      VIN: "ABC123",
      price: "$24,500",
      year: 2022,
      make: "Toyota",
      model: "RAV4",
    });
  });

  it("returns null when the natural key (vin) is missing", () => {
    expect(toInventoryRow({ make: "Toyota" }, meta)).toBeNull();
  });

  it("never throws on missing optional fields", () => {
    const row = toInventoryRow({ vin: "X" }, meta);
    expect(row?.listPrice).toBeNull();
    expect(row?.modelYear).toBeNull();
  });

  it("derives a stable recon line-item id when absent", () => {
    const r = toReconRow({ description: "Brakes", cost: 200 }, meta, "VIN9", 2);
    expect(r.lineItemId).toBe("VIN9:2");
    expect(r.cost).toBe(200);
  });

  it("falls back to a deterministic id for leads with no source id", () => {
    const a = toLeadRow({ customer_name: "Jane Doe", city: "Wilmington" }, meta);
    const b = toLeadRow({ customer_name: "Jane Doe", city: "Wilmington" }, meta);
    expect(a.leadId).toBe(b.leadId); // deterministic
    expect(a.leadId.startsWith("auto-")).toBe(true);
  });
});
