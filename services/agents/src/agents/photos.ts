import type { Agent, AgentRow, TriggerContext } from "../framework/agent.js";

interface Row {
  vin: string;
  make: string | null;
  model: string | null;
  model_year: number | null;
  photo_count: number;
  days_on_lot: number;
}

/**
 * Photos agent (fail-soft, requires the `photos` feed) — flags live units with
 * too few photos, which depresses VDP engagement. Owner: inventory manager.
 */
export const photosAgent: Agent = {
  name: "photos",
  recType: "photo_gap",
  ownerRole: "inventory_mgr",
  subjectType: "vin",
  requiresExt: ["photos"],
  defaultParams: { min_photos: 8, value_per_day: 15 },

  async trigger(ctx: TriggerContext): Promise<AgentRow[]> {
    const minPhotos = ctx.params["min_photos"] ?? 8;
    const valuePerDay = ctx.params["value_per_day"] ?? 15;
    const rows = await ctx.sql<Row[]>`
      with latest_photos as (
        select distinct on (location_id, vin) location_id, vin, photo_count
        from ext.photos where location_id = ${ctx.locationId}
        order by location_id, vin, snapshot_date desc
      )
      select c.vin, c.make, c.model, c.model_year,
             coalesce(p.photo_count, 0) as photo_count, d.days_on_lot
      from core.v_inventory_current c
      join core.v_days_on_lot d
        on d.location_id = c.location_id and d.vin = c.vin
      left join latest_photos p on p.location_id = c.location_id and p.vin = c.vin
      where c.location_id = ${ctx.locationId} and c.status = 'available'
        and coalesce(p.photo_count, 0) < ${minPhotos}
      order by d.days_on_lot desc
      limit 25
    `;
    return rows.map((r) => ({
      subjectId: r.vin,
      subjectLabel: `${r.make ?? "?"} ${r.model ?? "?"} ${r.model_year ?? ""} (${r.vin})`.trim(),
      baseImpact: Math.round(r.days_on_lot * valuePerDay),
      evidence: {
        photo_count: r.photo_count,
        days_on_lot: r.days_on_lot,
        min_photos: minPhotos,
        value_per_day: valuePerDay,
      },
    }));
  },

  systemInstructions(): string {
    return "Focus: live units below the photo minimum. Recommend a photo shoot. expected_dollar_impact is the engagement value lost while under-merchandised.";
  },

  fallbackText(row: AgentRow) {
    return {
      issue: `Only ${row.evidence["photo_count"]} photos (target ${row.evidence["min_photos"]}).`,
      action: "Schedule a full photo shoot for this unit.",
      rationale: `Under-merchandised for ${row.evidence["days_on_lot"]} days suppresses VDP engagement.`,
    };
  },
};
