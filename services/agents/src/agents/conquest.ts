import type { Agent, AgentRow, TriggerContext } from "../framework/agent.js";

interface Row {
  make: string;
  model: string;
  model_year: number;
  demand_units: string;
  units_sold_90: number;
  conquest_gap_units: string;
}

/**
 * Conquest agent — flags models with strong in-radius registration demand the
 * store is NOT capturing (conquest gap). Reads the owned Polk table via
 * core.v_conquest_flow (Rule 2). Owner: new-car manager.
 */
export const conquestAgent: Agent = {
  name: "conquest",
  recType: "conquest_opportunity",
  ownerRole: "new_car_mgr",
  subjectType: "make_model",
  requiresExt: [],
  defaultParams: { min_conquest_gap: 10, value_per_unit: 1800, max_units: 15 },

  async trigger(ctx: TriggerContext): Promise<AgentRow[]> {
    const minGap = ctx.params["min_conquest_gap"] ?? 10;
    const valuePerUnit = ctx.params["value_per_unit"] ?? 1800;
    const maxUnits = ctx.params["max_units"] ?? 15;
    const rows = await ctx.sql<Row[]>`
      select make, model, coalesce(model_year, 0) as model_year,
             demand_units, units_sold_90, conquest_gap_units
      from core.v_conquest_flow
      where location_id = ${ctx.locationId}
        and conquest_gap_units >= ${minGap}
      order by conquest_gap_units desc
      limit 20
    `;
    return rows.map((r) => {
      const gap = Number(r.conquest_gap_units);
      const target = Math.min(gap, maxUnits);
      return {
        subjectId: `${r.make}|${r.model}|${r.model_year}`,
        subjectLabel: `${r.make} ${r.model} ${r.model_year || "(year n/a)"}`,
        baseImpact: Math.round(target * valuePerUnit),
        evidence: {
          demand_units: Number(r.demand_units),
          units_sold_90: r.units_sold_90,
          conquest_gap_units: gap,
          target_units: target,
          value_per_unit: valuePerUnit,
        },
      };
    });
  },

  systemInstructions(): string {
    return [
      "Focus: models registered in the PMA radius that this store is not selling (conquest gap).",
      "Recommend a targeted marketing/inventory push to capture 'target_units'.",
      "expected_dollar_impact = target_units * value_per_unit (already computed).",
    ].join(" ");
  },

  fallbackText(row: AgentRow) {
    return {
      issue: `${row.evidence["conquest_gap_units"]} in-radius registrations not captured for this model.`,
      action: `Run a conquest campaign + stock to capture ~${row.evidence["target_units"]} units.`,
      rationale: `Radius demand is ${row.evidence["demand_units"]} vs ${row.evidence["units_sold_90"]} sold in 90 days.`,
    };
  },
};
