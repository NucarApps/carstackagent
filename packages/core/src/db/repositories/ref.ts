import type { Sql } from "../client.js";
import type { LocationMeta, RoleMeta } from "../../types/api.js";

/** Reference-data reads. */

export interface RefLocation {
  locationId: string;
  storeName: string;
  rooftopCode: string | null;
  radiusMiles: number;
  pmaZip: string | null;
}

export async function getActiveLocations(sql: Sql): Promise<RefLocation[]> {
  const rows = await sql<
    {
      location_id: string;
      store_name: string;
      rooftop_code: string | null;
      radius_miles: string;
      pma_zip: string | null;
    }[]
  >`
    select location_id, store_name, rooftop_code, radius_miles, pma_zip
    from ref.location
    where active = true
    order by location_id
  `;
  return rows.map((r) => ({
    locationId: r.location_id,
    storeName: r.store_name,
    rooftopCode: r.rooftop_code,
    radiusMiles: Number(r.radius_miles),
    pmaZip: r.pma_zip,
  }));
}

export async function getRoles(sql: Sql): Promise<RoleMeta[]> {
  const rows = await sql<
    { owner_role: RoleMeta["ownerRole"]; display_name: string; sort_order: number }[]
  >`
    select owner_role, display_name, sort_order
    from ref.role
    order by sort_order
  `;
  return rows.map((r) => ({
    ownerRole: r.owner_role,
    displayName: r.display_name,
    sortOrder: r.sort_order,
  }));
}

export async function getLocationMeta(sql: Sql): Promise<LocationMeta[]> {
  const rows = await sql<
    { location_id: string; store_name: string; rooftop_code: string | null }[]
  >`
    select location_id, store_name, rooftop_code
    from ref.location
    where active = true
    order by location_id
  `;
  return rows.map((r) => ({
    locationId: r.location_id,
    storeName: r.store_name,
    rooftopCode: r.rooftop_code,
  }));
}

export interface RecommendationType {
  recType: string;
  agent: string;
  ownerRole: string;
  defaultEnabled: boolean;
  requiresExt: string[];
}

export async function getRecommendationTypes(
  sql: Sql,
): Promise<RecommendationType[]> {
  const rows = await sql<
    {
      rec_type: string;
      agent: string;
      owner_role: string;
      default_enabled: boolean;
      requires_ext: string[] | null;
    }[]
  >`
    select rec_type, agent, owner_role, default_enabled, requires_ext
    from ref.recommendation_type
    order by rec_type
  `;
  return rows.map((r) => ({
    recType: r.rec_type,
    agent: r.agent,
    ownerRole: r.owner_role,
    defaultEnabled: r.default_enabled,
    requiresExt: r.requires_ext ?? [],
  }));
}
