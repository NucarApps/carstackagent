import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSql, type Sql } from "@dip/core";
import { insertDeal, insertInventory, resetData } from "@dip/testkit";

const HAS_DB = Boolean(process.env.DATABASE_URL);

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe.skipIf(!HAS_DB)("core.* derivations (snapshot series → derived truth)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = createSql({ max: 2 });
    await resetData(sql);
  });
  afterAll(async () => {
    await resetData(sql);
    await sql.end();
  });

  it("days-on-lot floors first_seen by the source hint", async () => {
    await insertInventory(sql, {
      snapshotDate: daysAgo(0),
      vin: "DOL1",
      firstSeenHint: daysAgo(70),
      listPrice: 30000,
    });
    const rows = await sql<{ days_on_lot: number }[]>`
      select days_on_lot from core.v_days_on_lot where vin = 'DOL1'
    `;
    expect(Number(rows[0]!.days_on_lot)).toBe(70);
  });

  it("price changes are counted and the markdown total summed from the series", async () => {
    await insertInventory(sql, { snapshotDate: daysAgo(2), vin: "PC1", listPrice: 30000 });
    await insertInventory(sql, { snapshotDate: daysAgo(1), vin: "PC1", listPrice: 30000 });
    await insertInventory(sql, { snapshotDate: daysAgo(0), vin: "PC1", listPrice: 28500 });
    const rows = await sql<{ price_change_count: number; total_markdown: string }[]>`
      select price_change_count, total_markdown from core.v_price_changes where vin = 'PC1'
    `;
    expect(Number(rows[0]!.price_change_count)).toBe(1);
    expect(Number(rows[0]!.total_markdown)).toBe(1500);
  });

  it("velocity counts a recent sale in the 30/60/90 windows", async () => {
    await insertInventory(sql, {
      snapshotDate: daysAgo(0),
      vin: "VEL1",
      make: "Honda",
      model: "CR-V",
      modelYear: 2022,
    });
    await insertDeal(sql, {
      snapshotDate: daysAgo(0),
      dealId: "VELDEAL1",
      vin: "VEL1",
      soldDate: daysAgo(10),
    });
    const rows = await sql<{ units_sold_30: number; units_sold_90: number }[]>`
      select units_sold_30, units_sold_90 from core.v_velocity
      where make = 'Honda' and model = 'CR-V' and model_year = 2022
    `;
    expect(Number(rows[0]!.units_sold_30)).toBe(1);
    expect(Number(rows[0]!.units_sold_90)).toBe(1);
  });
});
