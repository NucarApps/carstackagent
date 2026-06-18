import type { Agent, AgentRow, TriggerContext } from "../framework/agent.js";

interface Row {
  vin: string;
  make: string | null;
  model: string | null;
  model_year: number | null;
  list_price: string | null;
  days_on_lot: number;
  total_markdown: string;
}

/**
 * Aged-inventory agent — flags the oldest units regardless of markdown, where
 * the right move may be wholesale/auction rather than another price cut. Pure
 * snapshot-derived days-on-lot. Owner: used-car manager.
 */
export const agedInventoryAgent: Agent = {
  name: "aged-inventory",
  recType: "aged_inventory",
  ownerRole: "used_car_mgr",
  subjectType: "vin",
  requiresExt: [],
  defaultParams: { aged_days: 60 },

  async trigger(ctx: TriggerContext): Promise<AgentRow[]> {
    const agedDays = ctx.params["aged_days"] ?? 60;
    const rows = await ctx.sql<Row[]>`
      select c.vin, c.make, c.model, c.model_year, c.list_price,
             d.days_on_lot, coalesce(pc.total_markdown, 0) as total_markdown
      from core.v_inventory_current c
      join core.v_days_on_lot d
        on d.location_id = c.location_id and d.vin = c.vin
      left join core.v_price_changes pc
        on pc.location_id = c.location_id and pc.vin = c.vin
      where c.location_id = ${ctx.locationId}
        and c.status = 'available'
        and d.days_on_lot >= ${agedDays}
      order by d.days_on_lot desc
      limit 25
    `;
    return rows.map((r) => ({
      subjectId: r.vin,
      subjectLabel: `${r.make ?? "?"} ${r.model ?? "?"} ${r.model_year ?? ""} (${r.vin})`.trim(),
      baseImpact: Math.round(r.days_on_lot * 35),
      evidence: {
        days_on_lot: r.days_on_lot,
        list_price: r.list_price === null ? 0 : Number(r.list_price),
        total_markdown: Number(r.total_markdown),
        daily_carry_cost: 35,
      },
    }));
  },

  systemInstructions(): string {
    return [
      "Focus: the oldest units on the lot.",
      "For very aged units that have already been marked down, recommend wholesale/auction to stop the bleed; otherwise recommend an aggressive retail push.",
      "expected_dollar_impact is the recoverable carrying cost (days_on_lot * daily_carry_cost).",
    ].join(" ");
  },

  fallbackText(row: AgentRow) {
    const days = row.evidence["days_on_lot"];
    const markedDown = Number(row.evidence["total_markdown"]) > 0;
    return {
      issue: `Unit has been on the lot ${days} days.`,
      action: markedDown
        ? "Wholesale or send to auction to stop further carrying cost."
        : "Launch an aggressive retail push (price + merchandising).",
      rationale: `Carrying cost accrues at $${row.evidence["daily_carry_cost"]}/day; ${days} days held.`,
    };
  },
};
