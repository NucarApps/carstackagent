import { randomUUID } from "node:crypto";
import {
  childLogger,
  coreRepo,
  createLlmClient,
  createSql,
  loadAnthropicConfig,
  parseEnabledAgents,
  type LlmClient,
  type Sql,
} from "@dip/core";
import { getAgents } from "./agents/index.js";
import { runAgent, type AgentRunResult } from "./framework/runner.js";

export interface RunAgentsOptions {
  sql?: Sql;
  /** Pass null to force deterministic synthesis; omit to build from env. */
  llm?: LlmClient | null;
  runId?: string;
  enabled?: string[];
}

export interface RunAgentsResult {
  runId: string;
  results: AgentRunResult[];
  totalWritten: number;
}

function resolveLlm(
  override: LlmClient | null | undefined,
  logger: ReturnType<typeof childLogger>,
): LlmClient | null {
  if (override !== undefined) return override;
  if (process.env.ANTHROPIC_API_KEY) {
    const cfg = loadAnthropicConfig();
    return createLlmClient({
      apiKey: cfg.ANTHROPIC_API_KEY,
      model: cfg.ANTHROPIC_MODEL,
      maxTokens: cfg.AGENT_MAX_TOKENS,
    });
  }
  logger.warn("ANTHROPIC_API_KEY not set — using deterministic synthesis fallback");
  return null;
}

/** Run all enabled agents once. */
export async function runAgents(
  opts: RunAgentsOptions = {},
): Promise<RunAgentsResult> {
  const runId = opts.runId ?? randomUUID();
  const logger = childLogger({ svc: "agents", runId });
  const sql = opts.sql ?? createSql({ max: 5 });
  const ownSql = !opts.sql;
  const llm = resolveLlm(opts.llm, logger);

  const enabled =
    opts.enabled ??
    parseEnabledAgents(
      process.env.AGENTS_ENABLED ??
        "stocking,pricing,aged-inventory,lead-conversion,conquest",
    );

  try {
    const readiness = await coreRepo.getFeedReadiness(sql);
    const agents = getAgents(enabled);
    const results: AgentRunResult[] = [];
    let totalWritten = 0;

    for (const agent of agents) {
      try {
        const result = await runAgent(agent, { sql, llm, runId, readiness, logger });
        results.push(result);
        totalWritten += result.recommendationsWritten;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ agent: agent.name, err: message }, "agent failed");
        results.push({
          agent: agent.name,
          skipped: false,
          reason: `error: ${message}`,
          recommendationsWritten: 0,
        });
      }
    }

    logger.info({ totalWritten, agents: results.length }, "agents run complete");
    return { runId, results, totalWritten };
  } finally {
    if (ownSql) await sql.end({ timeout: 5 });
  }
}
