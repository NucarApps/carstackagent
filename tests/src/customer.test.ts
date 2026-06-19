import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { coreRepo, createSql, type Sql } from "@dip/core";
import { insertDeal, insertInventory, insertLead, resetData } from "@dip/testkit";

const HAS_DB = Boolean(process.env.DATABASE_URL);

const today = new Date().toISOString().slice(0, 10);

describe.skipIf(!HAS_DB)("customer resolution (Rule 4, fuzzy identity)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = createSql({ max: 2 });
    await resetData(sql);
  });
  afterAll(async () => {
    await resetData(sql);
    await sql.end();
  });

  it("links a lead and a deal for the same person into one customer journey", async () => {
    // Same normalized name + city + state across a lead and a deal.
    await insertLead(sql, {
      snapshotDate: today,
      leadId: "JL1",
      customerName: "John Q. Buyer",
      city: "Wilmington",
      state: "DE",
    });
    await insertInventory(sql, { snapshotDate: today, vin: "JVIN1" });
    await insertDeal(sql, {
      snapshotDate: today,
      dealId: "JD1",
      vin: "JVIN1",
      soldDate: today,
      customerName: "john q buyer", // different casing/punctuation, same person
      city: "Wilmington",
      state: "DE",
    });
    // An unrelated lead with no deal (a lead-conversion target).
    await insertLead(sql, {
      snapshotDate: today,
      leadId: "OL1",
      customerName: "Mary Open",
      city: "Newark",
      state: "DE",
    });

    const matched = await coreRepo.resolveCustomers(sql);
    expect(matched).toBeGreaterThanOrEqual(3);

    const buyer = await sql<{ lead_count: number; deal_count: number }[]>`
      select lead_count, deal_count from core.v_customer_journey
      where canonical_name ilike 'john%buyer'
    `;
    expect(buyer).toHaveLength(1);
    expect(Number(buyer[0]!.lead_count)).toBe(1);
    expect(Number(buyer[0]!.deal_count)).toBe(1);

    const open = await sql<{ deal_count: number }[]>`
      select deal_count from core.v_customer_journey where canonical_name = 'Mary Open'
    `;
    expect(Number(open[0]!.deal_count)).toBe(0);
  });
});
