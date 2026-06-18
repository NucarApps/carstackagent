import type { OwnerRole, SubjectType, Sql } from "@dip/core";

/**
 * Agent contract. An agent is deterministic trigger SQL that flags AND
 * pre-aggregates rows (all arithmetic, including the baseline dollar impact),
 * plus agent-specific guidance for the LLM synthesis step. The framework does
 * the rest (fail-soft, calibration, synthesis, dedupe, write).
 */

/** One flagged, pre-aggregated subject. `evidence` holds the numbers the model sees. */
export interface AgentRow {
  subjectId: string;
  subjectLabel: string;
  /** Pre-aggregated numbers/labels shown to the model; it may NOT compute new ones. */
  evidence: Record<string, number | string>;
  /** Deterministic expected dollar impact computed in SQL (the ranking key). */
  baseImpact: number;
}

export interface TriggerContext {
  sql: Sql;
  locationId: string;
  /** Effective calibration params (most-specific scope), merged over defaults. */
  params: Record<string, number>;
}

export interface Agent {
  name: string;
  recType: string;
  ownerRole: OwnerRole;
  subjectType: SubjectType;
  /** ext feeds that must be ready for this agent to run (Rule 5). */
  requiresExt: string[];
  /** Default calibration values used when no rec.manager_calibration row exists. */
  defaultParams: Record<string, number>;
  /** Deterministic SQL: flag + pre-aggregate rows for one location. */
  trigger(ctx: TriggerContext): Promise<AgentRow[]>;
  /** Agent-specific instructions appended to the base synthesis system prompt. */
  systemInstructions(): string;
  /** Deterministic issue/action/rationale used when the LLM is unavailable. */
  fallbackText(row: AgentRow): { issue: string; action: string; rationale: string };
}
