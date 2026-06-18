import {
  synthJsonSchema,
  synthResultSchema,
  type LlmClient,
  type recRepo,
} from "@dip/core";
import type { Agent, AgentRow } from "./agent.js";
import { buildSystemPrompt } from "./prompt.js";

type KnowledgeRow = Awaited<ReturnType<typeof recRepo.getKnowledge>>[number];

export interface SynthOutput {
  issue: string;
  action: string;
  rationale: string;
  confidence: number;
  /** Final, reconciled dollar impact (SQL value always wins on mismatch). */
  expectedDollarImpact: number;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/**
 * Reconcile a model-returned impact against the row's pre-aggregated numbers.
 * The model may only SELECT a supplied value; if its number does not match the
 * baseline (or any numeric evidence value), the deterministic SQL figure wins
 * and confidence is capped — enforcing "the LLM never does arithmetic".
 */
export function reconcileImpact(
  modelImpact: number,
  modelConfidence: number,
  row: AgentRow,
): { expectedDollarImpact: number; confidence: number } {
  const allowed = new Set<number>([Math.round(row.baseImpact)]);
  for (const v of Object.values(row.evidence)) {
    if (typeof v === "number" && Number.isFinite(v)) allowed.add(Math.round(v));
  }
  if (allowed.has(Math.round(modelImpact))) {
    return { expectedDollarImpact: modelImpact, confidence: clamp01(modelConfidence) };
  }
  // Mismatch: trust SQL, flag the uncertainty.
  return {
    expectedDollarImpact: row.baseImpact,
    confidence: Math.min(clamp01(modelConfidence), 0.5),
  };
}

/** Deterministic confidence heuristic used when the LLM is unavailable. */
function fallbackConfidence(baseImpact: number): number {
  return clamp01(0.5 + Math.min(Math.abs(baseImpact) / 10000, 0.4));
}

/**
 * Synthesize recommendations for an agent's flagged rows. Uses Claude with
 * structured output when an LLM client is provided; otherwise falls back to a
 * deterministic templating path so the pipeline runs without an API key.
 * Returns a map subject_id -> reconciled output (always covering every row).
 */
export async function synthesize(
  llm: LlmClient | null,
  agent: Agent,
  rows: AgentRow[],
  knowledge: KnowledgeRow[],
): Promise<Map<string, SynthOutput>> {
  const out = new Map<string, SynthOutput>();
  const byId = new Map(rows.map((r) => [r.subjectId, r]));

  if (llm) {
    const system = buildSystemPrompt(agent, knowledge);
    const payload = {
      subjects: rows.map((r) => ({
        subject_id: r.subjectId,
        subject: r.subjectLabel,
        evidence: { ...r.evidence, expected_dollar_impact: r.baseImpact },
      })),
    };
    const result = await llm.synthesize({
      system,
      userPayload: payload,
      schema: synthResultSchema,
      jsonSchema: synthJsonSchema(),
    });
    for (const item of result.recommendations) {
      const row = byId.get(item.subject_id);
      if (!row) continue;
      const { expectedDollarImpact, confidence } = reconcileImpact(
        item.expected_dollar_impact,
        item.confidence,
        row,
      );
      out.set(item.subject_id, {
        issue: item.issue,
        action: item.action,
        rationale: item.rationale,
        confidence,
        expectedDollarImpact,
      });
    }
  }

  // Fill any rows the model omitted (or all rows in deterministic mode).
  for (const row of rows) {
    if (out.has(row.subjectId)) continue;
    const t = agent.fallbackText(row);
    out.set(row.subjectId, {
      issue: t.issue,
      action: t.action,
      rationale: t.rationale,
      confidence: fallbackConfidence(row.baseImpact),
      expectedDollarImpact: row.baseImpact,
    });
  }

  return out;
}
