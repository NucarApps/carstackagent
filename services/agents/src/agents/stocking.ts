import type { Agent, AgentRow, TriggerContext } from "../framework/agent.js";

interface Row {
  make: string;
  model: string;
  model_year: number;
  demand_units: string;
  supply_units: number;
  units_sold_90: number;
}

/**
 * Stocking agent — flags make/model/model_year combos where in-PMA-radius demand
 * outstrips current supply, so the store should acquire. Reads the owned Polk
 * table via core.v_demand_radius (Rule 2: geo stays on the owned path), joined
 * to current supply and velocity. Owner: inventory manager.
 */
export const stockingAgent: Agent = {
  name: "stocking",
  recType: "stocking_acquire",
  ownerRole: "inventory_mgr",
  subjectType: "make_model",
  requiresExt: [],
  defaultParams: { demand_supply_ratio: 1.5, gross_per_unit: 2500, max_acquire: 10 },

  async trigger(ctx: TriggerContext): Promise<AgentRow[]> {
    const ratio = ctx.params["demand_supply_ratio"] ?? 1.5;
    const grossPerUnit = ctx.params["gross_per_unit"] ?? 2500;
    const maxAcquire = ctx.params["max_acquire"] ?? 10;
    const rows = await ctx.sql<Row[]>`
      with supply as (
        select location_id, make, model, coalesce(model_year, 0) as model_year,
               count(*) as supply_units
        from core.v_inventory_current
        where location_id = ${ctx.locationId} and status = 'available'
        group by location_id, make, model, coalesce(model_year, 0)
      ),
      demand as (
        select location_id, make, model, coalesce(model_year, 0) as model_year,
               sum(demand_units) as demand_units
        from core.v_demand_radius
        where location_id = ${ctx.locationId}
        group by location_id, make, model, coalesce(model_year, 0)
      )
      select d.make, d.model, d.model_year,
             d.demand_units,
             coalesce(s.supply_units, 0) as supply_units,
             coalesce(v.units_sold_90, 0) as units_sold_90
      from demand d
      left join supply s
        on s.location_id = d.location_id and s.make = d.make
       and s.model = d.model and s.model_year = d.model_year
      left join core.v_velocity v
        on v.location_id = d.location_id and v.make = d.make
       and v.model = d.model and coalesce(v.model_year, 0) = d.model_year
      where d.demand_units > 0
        and d.demand_units >= coalesce(s.supply_units, 0)::numeric * ${ratio}::numeric
      order by d.demand_units - coalesce(s.supply_units, 0) desc
      limit 20
    `;
    return rows.map((r) => {
      const demand = Number(r.demand_units);
      const gap = Math.max(demand - r.supply_units, 0);
      const acquire = Math.min(gap, maxAcquire);
      return {
        subjectId: `${r.make}|${r.model}|${r.model_year}`,
        subjectLabel: `${r.make} ${r.model} ${r.model_year || "(year n/a)"}`,
        baseImpact: Math.round(acquire * grossPerUnit),
        evidence: {
          demand_units: demand,
          supply_units: r.supply_units,
          units_sold_90: r.units_sold_90,
          acquisition_gap: gap,
          recommended_acquire: acquire,
          gross_per_unit: grossPerUnit,
        },
      };
    });
  },

  systemInstructions(): string {
    return [
      "Focus: acquire inventory where PMA-radius demand exceeds what is on the ground.",
      "Recommend acquiring 'recommended_acquire' units of this make/model/year.",
      "expected_dollar_impact = recommended_acquire * gross_per_unit (already computed).",
    ].join(" ");
  },

  fallbackText(row: AgentRow) {
    return {
      issue: `In-radius demand (${row.evidence["demand_units"]}) far exceeds supply (${row.evidence["supply_units"]}).`,
      action: `Acquire ~${row.evidence["recommended_acquire"]} units of this model.`,
      rationale: `Each unit is worth about $${row.evidence["gross_per_unit"]} gross; the lot is short by ${row.evidence["acquisition_gap"]}.`,
    };
  },
};
