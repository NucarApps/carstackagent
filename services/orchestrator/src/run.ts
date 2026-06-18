import {
  childLogger,
  createSql,
  loadOrchestratorConfig,
  recRepo,
  type Sql,
} from "@dip/core";

export interface RunOrchestratorOptions {
  sql?: Sql;
  expiryDays?: number;
  minDollarImpact?: number;
}

export interface RunOrchestratorResult {
  worklistRows: number;
  expiryDays: number;
  minDollarImpact: number;
}

/**
 * Refresh the worklist. Dedup is already guaranteed upstream (the partial unique
 * index on rec.recommendation(dedupe_key) WHERE status='open' keeps one open rec
 * per key). This step re-opens elapsed snoozes, expires stale opens, then ranks
 * open recs by expected_dollar_impact within (owner_role, location_id) and
 * rebuilds rec.worklist in a single transaction (recRepo.refreshWorklist).
 */
export async function runOrchestrator(
  opts: RunOrchestratorOptions = {},
): Promise<RunOrchestratorResult> {
  const logger = childLogger({ svc: "orchestrator" });
  const sql = opts.sql ?? createSql({ max: 3 });
  const ownSql = !opts.sql;

  const cfg = (() => {
    try {
      return loadOrchestratorConfig();
    } catch {
      return { WORKLIST_EXPIRY_DAYS: 14, MIN_DOLLAR_IMPACT: 250 } as const;
    }
  })();
  const expiryDays = opts.expiryDays ?? cfg.WORKLIST_EXPIRY_DAYS;
  const minDollarImpact = opts.minDollarImpact ?? cfg.MIN_DOLLAR_IMPACT;

  try {
    const worklistRows = await recRepo.refreshWorklist(sql, { expiryDays, minDollarImpact });
    logger.info({ worklistRows, expiryDays, minDollarImpact }, "worklist refreshed");
    return { worklistRows, expiryDays, minDollarImpact };
  } finally {
    if (ownSql) await sql.end({ timeout: 5 });
  }
}
