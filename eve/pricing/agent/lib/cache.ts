import type { AgentRow } from "@dip/agents/dist/framework/agent.js";

/**
 * Per-run cache of the SQL-flagged rows, so write_recommendation can use the
 * SQL-computed baseImpact/evidence for a subject the model only references by id
 * (the model never supplies numbers). Keyed by `${locationId}:${subjectId}`.
 */
const flagged = new Map<string, AgentRow>();

const key = (locationId: string, subjectId: string): string =>
  `${locationId}:${subjectId}`;

export function setFlagged(locationId: string, rows: AgentRow[]): void {
  for (const r of rows) flagged.set(key(locationId, r.subjectId), r);
}

export function getFlagged(locationId: string, subjectId: string): AgentRow | undefined {
  return flagged.get(key(locationId, subjectId));
}
