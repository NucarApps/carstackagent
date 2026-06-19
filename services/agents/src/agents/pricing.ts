import type { Agent, AgentRow, TriggerContext } from "../framework/agent.js";

interface Row {
  vin: string;
  make: string | null;
  model: string | null;
  model_year: number | null;
  list_price: string | null;
  days_on_lot: number;
  total_markdown: string;
  price_change_count: number;
  unpriced: number;
}

/**
 * Pricing agent — flags aged units that are unpriced or have not been marked
 * down, where a price action would help turn them. Pure snapshot/derived data
 * (Rule 1): days-on-lot + price-change history. Owner: used-car manager.
 */
export const pricingAgent: Agent = {
  name: "pricing",
  recType: "pricing_markdown",
  ownerRole: "used_car_mgr",
  subjectType: "vin",
  requiresExt: [],
  defaultParams: { aged_days: 45, min_markdown: 0 },

  async trigger(ctx: TriggerContext): Promise<AgentRow[]> {
    const agedDays = ctx.params["aged_days"] ?? 45;
    const minMarkdown = ctx.params["min_markdown"] ?? 0;
    const rows = await ctx.sql<Row[]>`
      select c.vin, c.make, c.model, c.model_year, c.list_price,
             d.days_on_lot,
             coalesce(pc.total_markdown, 0) as total_markdown,
             coalesce(pc.price_change_count, 0) as price_change_count,
             (c.unpriced)::int as unpriced
      from core.v_inventory_current c
      join core.v_days_on_lot d
        on d.location_id = c.location_id and d.vin = c.vin
      left join core.v_price_changes pc
        on pc.location_id = c.location_id and pc.vin = c.vin
      where c.location_id = ${ctx.locationId}
        and c.status = 'available'
        and d.days_on_lot >= ${agedDays}
        and (c.unpriced or coalesce(pc.total_markdown, 0) <= ${minMarkdown})
      order by d.days_on_lot desc
      limit 25
    `;
    return rows.map((r) => ({
      subjectId: r.vin,
      subjectLabel: `${r.make ?? "?"} ${r.model ?? "?"} ${r.model_year ?? ""} (${r.vin})`.trim(),
      baseImpact: Math.round(r.days_on_lot * 32),
      evidence: {
        days_on_lot: r.days_on_lot,
        list_price: r.list_price === null ? 0 : Number(r.list_price),
        total_markdown: Number(r.total_markdown),
        price_change_count: r.price_change_count,
        unpriced: r.unpriced,
        daily_holding_cost: 32,
      },
    }));
  },

  systemInstructions(): string {
    return [
      "Focus: aged used units that are unpriced or have had no markdown.",
      "If unpriced (unpriced=1), the action is to set a market price immediately.",
      "Otherwise recommend a markdown sized to the holding cost already incurred.",
      "expected_dollar_impact is the recoverable holding cost (days_on_lot * daily_holding_cost).",
    ].join(" ");
  },

  fallbackText(row: AgentRow) {
    const unpriced = row.evidence["unpriced"] === 1;
    const days = row.evidence["days_on_lot"];
    return {
      issue: unpriced
        ? `Unpriced unit aged ${days} days — it cannot convert until priced.`
        : `Aged ${days} days with no markdown — turn is stalling.`,
      action: unpriced
        ? "Set a market-competitive price today."
        : "Apply a markdown sized to the accrued holding cost.",
      rationale: `Holding cost has accrued at $${row.evidence["daily_holding_cost"]}/day for ${days} days.`,
    };
  },
};
