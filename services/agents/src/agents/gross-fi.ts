import type { Agent, AgentRow, TriggerContext } from "../framework/agent.js";

interface Row {
  deal_id: string;
  vin: string | null;
  front_gross: string | null;
  back_gross: string | null;
  fi_product_count: number;
  sold_date: string | null;
}

/**
 * Gross/F&I agent (fail-soft, requires the `gross_fi` DMS feed) — flags recent
 * deals with thin F&I product penetration, where coaching/process could recover
 * back-end gross. Owner: finance manager.
 */
export const grossFiAgent: Agent = {
  name: "gross-fi",
  recType: "gross_protection",
  ownerRole: "finance_mgr",
  subjectType: "vin",
  requiresExt: ["gross_fi"],
  defaultParams: { min_products: 2, uplift_per_product: 500 },

  async trigger(ctx: TriggerContext): Promise<AgentRow[]> {
    const minProducts = ctx.params["min_products"] ?? 2;
    const uplift = ctx.params["uplift_per_product"] ?? 500;
    const rows = await ctx.sql<Row[]>`
      with latest_deals as (
        select distinct on (location_id, deal_id) location_id, deal_id, vin
        from raw.deal_snapshot where location_id = ${ctx.locationId}
        order by location_id, deal_id, snapshot_date desc
      )
      select g.deal_id, ld.vin, g.front_gross, g.back_gross,
             coalesce(g.fi_product_count, 0) as fi_product_count, g.sold_date
      from ext.gross_fi g
      join latest_deals ld
        on ld.location_id = g.location_id and ld.deal_id = g.deal_id
      where g.location_id = ${ctx.locationId}
        and coalesce(g.fi_product_count, 0) < ${minProducts}
      order by g.sold_date desc nulls last
      limit 25
    `;
    return rows.map((r) => {
      const shortfall = Math.max(minProducts - r.fi_product_count, 0);
      return {
        subjectId: r.deal_id,
        subjectLabel: `Deal ${r.deal_id}${r.vin ? ` (${r.vin})` : ""}`,
        baseImpact: Math.round(shortfall * uplift),
        evidence: {
          fi_product_count: r.fi_product_count,
          front_gross: r.front_gross === null ? 0 : Number(r.front_gross),
          back_gross: r.back_gross === null ? 0 : Number(r.back_gross),
          min_products: minProducts,
          uplift_per_product: uplift,
        },
      };
    });
  },

  systemInstructions(): string {
    return "Focus: deals with low F&I product penetration. Recommend a coaching/process action. expected_dollar_impact is the recoverable back-end gross.";
  },

  fallbackText(row: AgentRow) {
    return {
      issue: `Only ${row.evidence["fi_product_count"]} F&I products (target ${row.evidence["min_products"]}).`,
      action: "Review the deal in the next F&I huddle and adjust the menu presentation.",
      rationale: `Each added product is worth about $${row.evidence["uplift_per_product"]} back-end.`,
    };
  },
};
