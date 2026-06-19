import { recRepo, refRepo, type LlmClient, type Logger, type Sql } from "@dip/core";
import type { Agent } from "./agent.js";
import { loadParams } from "./calibration.js";
import { feedsReady } from "./failsoft.js";
import { buildDedupeKey } from "./dedupe-key.js";
import { synthesize } from "./synth.js";

export interface AgentRunDeps {
  sql: Sql;
  llm: LlmClient | null;
  runId: string;
  readiness: Record<string, boolean>;
  logger: Logger;
}

export interface AgentRunResult {
  agent: string;
  skipped: boolean;
  reason?: string;
  recommendationsWritten: number;
}

/**
 * Run one agent across all active locations: fail-soft on missing ext feeds →
 * deterministic trigger SQL (flags + pre-aggregates) → knowledge retrieval →
 * LLM synthesis (or deterministic fallback) → write rec.recommendation.
 */
export async function runAgent(
  agent: Agent,
  deps: AgentRunDeps,
): Promise<AgentRunResult> {
  if (!feedsReady(agent, deps.readiness)) {
    deps.logger.info(
      { agent: agent.name, requiresExt: agent.requiresExt },
      "fail-soft skip: required ext feed not ready",
    );
    return {
      agent: agent.name,
      skipped: true,
      reason: "ext_feed_not_ready",
      recommendationsWritten: 0,
    };
  }

  const locations = await refRepo.getActiveLocations(deps.sql);
  let written = 0;

  for (const loc of locations) {
    const params = await loadParams(deps.sql, agent, loc.locationId);
    const rows = await agent.trigger({ sql: deps.sql, locationId: loc.locationId, params });
    if (rows.length === 0) continue;

    const knowledge = await recRepo.getKnowledge(deps.sql, {
      role: agent.ownerRole,
      locationId: loc.locationId,
      recType: agent.recType,
    });

    const synth = await synthesize(deps.llm, agent, rows, knowledge);

    for (const row of rows) {
      const s = synth.get(row.subjectId);
      if (!s) continue;
      await recRepo.insertOrRefreshRecommendation(
        deps.sql,
        {
          agent: agent.name,
          recType: agent.recType,
          ownerRole: agent.ownerRole,
          locationId: loc.locationId,
          subjectType: agent.subjectType,
          subjectId: row.subjectId,
          dedupeKey: buildDedupeKey(
            agent.recType,
            loc.locationId,
            agent.subjectType,
            row.subjectId,
          ),
          issue: s.issue,
          evidence: {
            ...row.evidence,
            subject: row.subjectLabel,
            expected_dollar_impact: row.baseImpact,
          },
          action: s.action,
          rationale: s.rationale,
          expectedDollarImpact: s.expectedDollarImpact,
          confidence: s.confidence,
        },
        deps.runId,
      );
      written += 1;
    }
  }

  deps.logger.info({ agent: agent.name, written }, "agent complete");
  return { agent: agent.name, skipped: false, recommendationsWritten: written };
}
