import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CarstackClient, FixedClock, createSql, type Sql } from "@dip/core";
import { mockFetch, resetData } from "@dip/testkit";
import { runIngestion } from "@dip/ingestion/dist/run.js";

const HAS_DB = Boolean(process.env.DATABASE_URL);

function client(forbidden: string[] = []): CarstackClient {
  return new CarstackClient({
    base: "https://carstack.io/api/v1/t/Nucar",
    apiKey: "test",
    pageSizeMax: 200,
    vdpRatePerMin: 1_000_000, // disable throttling in tests
    defaultRatePerMin: 1_000_000,
    fetchImpl: mockFetch({ forbidden }),
    sleepFn: () => Promise.resolve(),
  });
}

const clock = new FixedClock(new Date("2026-06-18T12:00:00Z"));

async function countRaw(sql: Sql): Promise<Record<string, number>> {
  const rows = await sql<{ t: string; c: string }[]>`
    select 'inventory' t, count(*) c from raw.inventory_snapshot
    union all select 'vdp', count(*) from raw.vdp_enrichment_snapshot
    union all select 'recon', count(*) from raw.recon_line_item
    union all select 'registration', count(*) from raw.registration_snapshot
  `;
  return Object.fromEntries(rows.map((r) => [r.t, Number(r.c)]));
}

describe.skipIf(!HAS_DB)("ingestion against the mock CarStack", () => {
  let sql: Sql;
  beforeEach(async () => {
    sql = createSql({ max: 5 });
    await resetData(sql);
  });
  afterAll(async () => {
    if (sql) await sql.end();
  });

  it("is idempotent: a second run yields identical counts", async () => {
    await runIngestion({ sql, client: client(), clock });
    const first = await countRaw(sql);
    await runIngestion({ sql, client: client(), clock });
    const second = await countRaw(sql);
    expect(second).toEqual(first);
    expect(first["inventory"]).toBeGreaterThan(200); // pagination beyond one page
    expect(first["recon"]).toBeGreaterThan(0); // per-VIN fan-out
  });

  it("fails soft on a 403 (scope not enabled) without aborting other endpoints", async () => {
    const result = await runIngestion({
      sql,
      client: client(["/registration"]),
      clock,
    });
    const counts = await countRaw(sql);
    expect(counts["registration"]).toBe(0); // forbidden endpoint produced nothing
    expect(counts["inventory"]).toBeGreaterThan(0); // others still ingested
    const stats = result.endpointStats as Record<string, { forbidden: number }>;
    expect(stats["registration"]?.forbidden).toBeGreaterThanOrEqual(1);
    expect(result.status).toBe("succeeded"); // 403 is non-fatal, not an error
  });
});
