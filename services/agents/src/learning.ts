import {
  childLogger,
  createSql,
  loadAnthropicConfig,
  recRepo,
  type Sql,
} from "@dip/core";

/**
 * Weekly learning loop (never fine-tunes). It (1) retunes SQL thresholds in
 * rec.manager_calibration based on accept/dismiss outcomes, and (2) grows the
 * retrieved knowledge base rec.manager_knowledge from recurring dismiss reasons.
 * Everything is bounded by CALIBRATION_LEARN_RATE and audited in rec.learning_run.
 * See docs/interaction_and_learning_spec.md.
 */

interface NudgeRule {
  param: string;
  tighten: number; // applied when managers dismiss too often (raise the bar)
  loosen: number; // applied when accepts dominate (surface more)
  min: number;
  max: number;
}

// Which calibration param each rec_type's outcomes should move, and how far.
const NUDGES: Record<string, NudgeRule> = {
  aged_inventory: { param: "aged_days", tighten: 5, loosen: -3, min: 20, max: 120 },
  pricing_markdown: { param: "aged_days", tighten: 5, loosen: -3, min: 15, max: 120 },
  stocking_acquire: { param: "demand_supply_ratio", tighten: 0.25, loosen: -0.1, min: 1, max: 5 },
  conquest_opportunity: { param: "min_conquest_gap", tighten: 5, loosen: -2, min: 1, max: 100 },
  lead_followup: { param: "stale_days", tighten: 1, loosen: -1, min: 1, max: 30 },
};

const MIN_FEEDBACK = 3; // need a minimum sample before moving a threshold

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export interface RunLearningOptions {
  sql?: Sql;
  /** Window of feedback to consider (days). */
  sinceDays?: number;
  /** Override the bounded step size (defaults to CALIBRATION_LEARN_RATE or 0.25). */
  learnRate?: number;
}

export interface RunLearningResult {
  feedbackProcessed: number;
  calibrationChanges: number;
  knowledgeCreated: number;
}

export async function runLearning(
  opts: RunLearningOptions = {},
): Promise<RunLearningResult> {
  const logger = childLogger({ svc: "learning" });
  const sql = opts.sql ?? createSql({ max: 3 });
  const ownSql = !opts.sql;
  const sinceDays = opts.sinceDays ?? 7;
  const learnRate =
    opts.learnRate ??
    (() => {
      try {
        return loadAnthropicConfig().CALIBRATION_LEARN_RATE;
      } catch {
        return 0.25;
      }
    })();

  const sinceIso = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

  try {
    const feedback = await recRepo.getFeedbackSince(sql, sinceIso);

    // Group by rec_type.
    const byType = new Map<string, typeof feedback>();
    for (const f of feedback) {
      const arr = byType.get(f.recType) ?? [];
      arr.push(f);
      byType.set(f.recType, arr);
    }

    let calibrationChanges = 0;
    let knowledgeCreated = 0;
    const detail: Array<Record<string, unknown>> = [];

    for (const [recType, items] of byType) {
      const total = items.length;
      if (total < MIN_FEEDBACK) continue;
      const dismiss = items.filter((i) => i.action === "dismiss").length;
      const accept = items.filter((i) => i.action === "accept").length;
      const dismissRate = dismiss / total;
      const acceptRate = accept / total;

      // (1) Retune the threshold.
      const rule = NUDGES[recType];
      if (rule) {
        const current = await currentParam(sql, recType, rule.param);
        let delta = 0;
        if (dismissRate > 0.5) delta = rule.tighten;
        else if (acceptRate > 0.6 && dismissRate < 0.2) delta = rule.loosen;
        if (delta !== 0) {
          // Scale the step by the learn rate (0.25 → full nominal step).
          const scaled = delta * (learnRate / 0.25);
          const next = clamp(current + scaled, rule.min, rule.max);
          if (Math.abs(next - current) >= 0.01) {
            await recRepo.upsertCalibration(sql, {
              scopeRole: null,
              locationId: null,
              recType,
              paramKey: rule.param,
              paramValue: Number(next.toFixed(2)),
              source: "learned",
            });
            calibrationChanges += 1;
            detail.push({ recType, param: rule.param, from: current, to: next, dismissRate, acceptRate });
          }
        }
      }

      // (2) Grow knowledge from recurring dismiss reasons.
      const reasons = new Map<string, string[]>();
      for (const i of items) {
        if (i.action !== "dismiss" || !i.reason) continue;
        const key = i.reason.trim().toLowerCase();
        const ids = reasons.get(key) ?? [];
        ids.push(i.feedbackId);
        reasons.set(key, ids);
      }
      for (const [reasonKey, ids] of reasons) {
        if (ids.length < 2) continue;
        const owner = items.find((i) => i.feedbackId === ids[0])?.ownerRole ?? null;
        await recRepo.insertKnowledge(sql, {
          scopeRole: owner,
          locationId: null,
          recType,
          title: `Recurring dismissal for ${recType}`,
          body: `Managers repeatedly dismissed "${recType}" recommendations citing: "${reasonKey}". Weigh this before recommending; it may indicate a known exception.`,
          sourceFeedbackIds: ids,
          weight: 1 + ids.length * 0.1,
        });
        knowledgeCreated += 1;
        detail.push({ recType, knowledge: reasonKey, count: ids.length });
      }
    }

    await recRepo.insertLearningRun(sql, {
      feedbackProcessed: feedback.length,
      calibrationChanges,
      knowledgeCreated,
      detail,
    });

    logger.info(
      { feedbackProcessed: feedback.length, calibrationChanges, knowledgeCreated },
      "learning run complete",
    );
    return { feedbackProcessed: feedback.length, calibrationChanges, knowledgeCreated };
  } finally {
    if (ownSql) await sql.end({ timeout: 5 });
  }
}

async function currentParam(sql: Sql, recType: string, param: string): Promise<number> {
  const params = await recRepo.getCalibrationParams(sql, { role: null, locationId: null, recType });
  return params[param] ?? 0;
}

// Entrypoint when run directly (Railway weekly cron).
if (process.argv[1] && process.argv[1].endsWith("learning.js")) {
  runLearning()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("learning run crashed:", err);
      process.exit(1);
    });
}
