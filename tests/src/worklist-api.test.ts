import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSql, recRepo, type Sql } from "@dip/core";
import { resetData } from "@dip/testkit";
import { runOrchestrator } from "@dip/orchestrator/dist/run.js";
import { buildServer } from "@dip/api/dist/server.js";

const HAS_DB = Boolean(process.env.DATABASE_URL);

function insertRec(sql: Sql, subjectId: string, impact: number): Promise<string> {
  return recRepo.insertOrRefreshRecommendation(
    sql,
    {
      agent: "pricing",
      recType: "pricing_markdown",
      ownerRole: "used_car_mgr",
      locationId: "NUCAR-01",
      subjectType: "vin",
      subjectId,
      dedupeKey: `pricing_markdown:NUCAR-01:vin:${subjectId}`,
      issue: `issue ${subjectId}`,
      evidence: { days_on_lot: 50 },
      action: "act",
      rationale: "why",
      expectedDollarImpact: impact,
      confidence: 0.7,
    },
    null,
  );
}

interface WlItem {
  recommendationId: string;
  subjectId: string;
  rank: number;
  expectedDollarImpact: number;
}

describe.skipIf(!HAS_DB)("worklist orchestration + api", () => {
  let sql: Sql;
  beforeAll(async () => {
    sql = createSql({ max: 5 });
    await resetData(sql);
  });
  afterAll(async () => {
    await resetData(sql);
    await sql.end();
  });

  it("keeps one OPEN recommendation per dedupe_key (refresh in place)", async () => {
    const id1 = await insertRec(sql, "DUP", 1000);
    const id2 = await insertRec(sql, "DUP", 2000); // same dedupe_key
    expect(id2).toBe(id1); // refreshed, not duplicated
    const rows = await sql<{ c: string }[]>`
      select count(*) c from rec.recommendation
      where dedupe_key = 'pricing_markdown:NUCAR-01:vin:DUP' and status = 'open'
    `;
    expect(Number(rows[0]!.c)).toBe(1);
  });

  it("ranks by expected_dollar_impact and serves it through the api", async () => {
    await insertRec(sql, "A", 500);
    await insertRec(sql, "B", 9000);
    await insertRec(sql, "C", 3000);

    const r = await runOrchestrator({ sql, minDollarImpact: 0, expiryDays: 365 });
    expect(r.worklistRows).toBeGreaterThanOrEqual(3);

    const app = buildServer({ sql, jwtSecret: "dev", corsOrigin: "*", logger: false });
    try {
      const res = await app.inject({
        method: "GET",
        url: "/worklist?role=used_car_mgr&location_id=NUCAR-01&limit=50",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { items: WlItem[] };
      const subjects = body.items.map((i) => i.subjectId);
      expect(subjects.indexOf("B")).toBeLessThan(subjects.indexOf("C"));
      expect(subjects.indexOf("C")).toBeLessThan(subjects.indexOf("A"));

      const recB = body.items.find((i) => i.subjectId === "B")!;
      const fb = await app.inject({
        method: "POST",
        url: `/recommendations/${recB.recommendationId}/feedback`,
        headers: { "content-type": "application/json" },
        payload: { action: "dismiss", reason: "already handled" },
      });
      expect(fb.statusCode).toBe(200);

      const after = await sql<{ status: string }[]>`
        select status from rec.recommendation where recommendation_id = ${recB.recommendationId}
      `;
      expect(after[0]!.status).toBe("dismissed");
    } finally {
      await app.close();
    }
  });
});
