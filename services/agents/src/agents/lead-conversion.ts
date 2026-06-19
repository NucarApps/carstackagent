import type { Agent, AgentRow, TriggerContext } from "../framework/agent.js";

interface Row {
  lead_id: string;
  customer_name: string | null;
  make: string | null;
  model: string | null;
  age_days: number;
}

/**
 * Lead-conversion agent — flags stale open leads whose (fuzzy-resolved) customer
 * has no deal yet, so the BDC can follow up. Uses core.customer_match (Rule 4)
 * to tell "no deal for this person" apart from "different person". Owner: BDC.
 */
export const leadConversionAgent: Agent = {
  name: "lead-conversion",
  recType: "lead_followup",
  ownerRole: "bdc_mgr",
  subjectType: "customer",
  requiresExt: [],
  defaultParams: { stale_days: 3, value_per_lead: 450 },

  async trigger(ctx: TriggerContext): Promise<AgentRow[]> {
    const staleDays = ctx.params["stale_days"] ?? 3;
    const valuePerLead = ctx.params["value_per_lead"] ?? 450;
    const rows = await ctx.sql<Row[]>`
      with latest_leads as (
        select distinct on (location_id, lead_id)
          location_id, lead_id, customer_name, make, model, created_hint
        from raw.lead_snapshot
        where location_id = ${ctx.locationId}
        order by location_id, lead_id, snapshot_date desc
      )
      select l.lead_id, l.customer_name, l.make, l.model,
             greatest(coalesce(current_date - l.created_hint, 999), 0) as age_days
      from latest_leads l
      left join core.customer_match cm
        on cm.source_type = 'lead' and cm.source_id = l.lead_id
       and cm.location_id = l.location_id
      left join lateral (
        select 1 as found from core.customer_match d
        where d.source_type = 'deal' and d.customer_uid = cm.customer_uid
        limit 1
      ) hd on true
      where hd.found is null
        and coalesce(current_date - l.created_hint, 999) >= ${staleDays}
      order by l.created_hint asc nulls last
      limit 25
    `;
    return rows.map((r) => ({
      subjectId: r.lead_id,
      subjectLabel: `${r.customer_name ?? "Lead"} — ${r.make ?? "?"} ${r.model ?? ""}`.trim(),
      baseImpact: Math.round(valuePerLead),
      evidence: {
        age_days: r.age_days,
        interest_make: r.make ?? "unknown",
        interest_model: r.model ?? "unknown",
        value_per_lead: valuePerLead,
      },
    }));
  },

  systemInstructions(): string {
    return [
      "Focus: open leads with no resulting deal that have gone stale.",
      "Recommend the specific next outreach (call/text/email) referencing the vehicle of interest.",
      "expected_dollar_impact is the standing value of working the lead (value_per_lead).",
    ].join(" ");
  },

  fallbackText(row: AgentRow) {
    return {
      issue: `Lead is ${row.evidence["age_days"]} days old with no deal and no recent follow-up.`,
      action: `Call/text the customer today about the ${row.evidence["interest_make"]} ${row.evidence["interest_model"]}.`,
      rationale: `Working a stale lead is worth about $${row.evidence["value_per_lead"]} in expected gross.`,
    };
  },
};
