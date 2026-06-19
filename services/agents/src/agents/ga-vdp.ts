import type { Agent, AgentRow, TriggerContext } from "../framework/agent.js";

interface Row {
  vin: string;
  make: string | null;
  model: string | null;
  model_year: number | null;
  vdp_views: number;
  ga_sessions: number;
  days_on_lot: number;
}

/**
 * GA/VDP agent (fail-soft, requires the `ga_vdp` analytics feed) — flags live
 * units with low VDP engagement relative to time on lot, suggesting a
 * merchandising or paid-traffic fix. Owner: marketing manager.
 */
export const gaVdpAgent: Agent = {
  name: "ga-vdp",
  recType: "vdp_engagement",
  ownerRole: "marketing_mgr",
  subjectType: "vin",
  requiresExt: ["ga_vdp"],
  defaultParams: { min_views: 50, value_per_day: 10 },

  async trigger(ctx: TriggerContext): Promise<AgentRow[]> {
    const minViews = ctx.params["min_views"] ?? 50;
    const valuePerDay = ctx.params["value_per_day"] ?? 10;
    const rows = await ctx.sql<Row[]>`
      with latest_ga as (
        select distinct on (location_id, vin) location_id, vin, vdp_views, ga_sessions
        from ext.ga_vdp where location_id = ${ctx.locationId}
        order by location_id, vin, snapshot_date desc
      )
      select c.vin, c.make, c.model, c.model_year,
             coalesce(g.vdp_views, 0) as vdp_views,
             coalesce(g.ga_sessions, 0) as ga_sessions,
             d.days_on_lot
      from core.v_inventory_current c
      join core.v_days_on_lot d
        on d.location_id = c.location_id and d.vin = c.vin
      left join latest_ga g on g.location_id = c.location_id and g.vin = c.vin
      where c.location_id = ${ctx.locationId} and c.status = 'available'
        and d.days_on_lot >= 7
        and coalesce(g.vdp_views, 0) < ${minViews}
      order by d.days_on_lot desc
      limit 25
    `;
    return rows.map((r) => ({
      subjectId: r.vin,
      subjectLabel: `${r.make ?? "?"} ${r.model ?? "?"} ${r.model_year ?? ""} (${r.vin})`.trim(),
      baseImpact: Math.round(r.days_on_lot * valuePerDay),
      evidence: {
        vdp_views: r.vdp_views,
        ga_sessions: r.ga_sessions,
        days_on_lot: r.days_on_lot,
        min_views: minViews,
        value_per_day: valuePerDay,
      },
    }));
  },

  systemInstructions(): string {
    return "Focus: live units with low VDP engagement for their time on lot. Recommend a merchandising refresh or paid-traffic boost. expected_dollar_impact is the engagement value lost.";
  },

  fallbackText(row: AgentRow) {
    return {
      issue: `Only ${row.evidence["vdp_views"]} VDP views after ${row.evidence["days_on_lot"]} days.`,
      action: "Refresh merchandising and add a paid-traffic boost for this VDP.",
      rationale: `Low engagement (target ${row.evidence["min_views"]} views) is suppressing lead flow.`,
    };
  },
};
