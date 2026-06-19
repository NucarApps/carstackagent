import { recRepo, type Sql } from "@dip/core";
import type { Agent } from "./agent.js";

/**
 * Effective calibration params for an agent at a location: DB rows (most-specific
 * scope wins) layered over the agent's hard-coded defaults. Agents read
 * thresholds from here rather than hard-coding them, so the learning loop can
 * retune behavior without code changes.
 */
export async function loadParams(
  sql: Sql,
  agent: Agent,
  locationId: string,
): Promise<Record<string, number>> {
  const fromDb = await recRepo.getCalibrationParams(sql, {
    role: agent.ownerRole,
    locationId,
    recType: agent.recType,
  });
  return { ...agent.defaultParams, ...fromDb };
}
