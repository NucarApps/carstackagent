import type { Sql } from "../client.js";
import type {
  FeedbackAction,
  OwnerRole,
  RecommendationDraft,
} from "../../types/rec.js";
import type {
  RecommendationDetail,
  WorklistItem,
} from "../../types/api.js";

/** rec.* contract: recommendation writes, worklist, feedback, learning loop. */

export interface CalibrationScope {
  role?: OwnerRole | null;
  locationId?: string | null;
  recType?: string | null;
}

/**
 * Write (or refresh) a recommendation. The partial unique index
 * `(dedupe_key) WHERE status='open'` guarantees one open recommendation per
 * dedupe_key; a same-key write refreshes the open row in place (newest wins),
 * preserving the recommendation_id so feedback linkage survives.
 */
export async function insertOrRefreshRecommendation(
  sql: Sql,
  draft: RecommendationDraft,
  runId: string | null,
): Promise<string> {
  const rows = await sql<{ recommendation_id: string }[]>`
    insert into rec.recommendation (
      agent, rec_type, owner_role, location_id, subject_type, subject_id,
      dedupe_key, issue, evidence, action, rationale,
      expected_dollar_impact, confidence, status, generated_run_id, created_at
    ) values (
      ${draft.agent}, ${draft.recType}, ${draft.ownerRole}, ${draft.locationId},
      ${draft.subjectType}, ${draft.subjectId}, ${draft.dedupeKey}, ${draft.issue},
      ${sql.json(draft.evidence as never)}, ${draft.action}, ${draft.rationale},
      ${draft.expectedDollarImpact}, ${draft.confidence}, 'open', ${runId}, now()
    )
    on conflict (dedupe_key) where status = 'open' do update set
      agent = excluded.agent,
      rec_type = excluded.rec_type,
      owner_role = excluded.owner_role,
      location_id = excluded.location_id,
      subject_type = excluded.subject_type,
      subject_id = excluded.subject_id,
      issue = excluded.issue,
      evidence = excluded.evidence,
      action = excluded.action,
      rationale = excluded.rationale,
      expected_dollar_impact = excluded.expected_dollar_impact,
      confidence = excluded.confidence,
      generated_run_id = excluded.generated_run_id,
      created_at = now()
    returning recommendation_id
  `;
  return rows[0]!.recommendation_id;
}

/** Effective calibration params for a scope; most-specific scope row wins per key. */
export async function getCalibrationParams(
  sql: Sql,
  scope: CalibrationScope,
): Promise<Record<string, number>> {
  const role = scope.role ?? null;
  const locationId = scope.locationId ?? null;
  const recType = scope.recType ?? null;
  const rows = await sql<{ param_key: string; param_value: string }[]>`
    select distinct on (param_key) param_key, param_value
    from rec.manager_calibration
    where (scope_role is null or scope_role = ${role})
      and (location_id is null or location_id = ${locationId})
      and (rec_type is null or rec_type = ${recType})
    order by param_key,
      ((scope_role is not null)::int
       + (location_id is not null)::int
       + (rec_type is not null)::int) desc
  `;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.param_key] = Number(r.param_value);
  return out;
}

export interface KnowledgeRow {
  title: string;
  body: string;
  weight: number;
}

/** Retrieved knowledge rows for a scope, highest weight first (RAG input). */
export async function getKnowledge(
  sql: Sql,
  scope: CalibrationScope,
  limit = 12,
): Promise<KnowledgeRow[]> {
  const role = scope.role ?? null;
  const locationId = scope.locationId ?? null;
  const recType = scope.recType ?? null;
  const rows = await sql<{ title: string; body: string; weight: string }[]>`
    select title, body, weight
    from rec.manager_knowledge
    where (scope_role is null or scope_role = ${role})
      and (location_id is null or location_id = ${locationId})
      and (rec_type is null or rec_type = ${recType})
    order by weight desc, created_at desc
    limit ${limit}
  `;
  return rows.map((r) => ({ title: r.title, body: r.body, weight: Number(r.weight) }));
}

/** Orchestrator: re-open expired snoozes, expire stale opens, rebuild rec.worklist. */
export async function refreshWorklist(
  sql: Sql,
  opts: { expiryDays: number; minDollarImpact: number },
): Promise<number> {
  return withWorklistTransaction(sql, opts);
}

async function withWorklistTransaction(
  sql: Sql,
  opts: { expiryDays: number; minDollarImpact: number },
): Promise<number> {
  return sql.begin(async (tx) => {
    await tx`
      update rec.recommendation set status = 'open'
      where status = 'snoozed'
        and snooze_until is not null
        and snooze_until <= current_date
    `;
    await tx`
      update rec.recommendation set status = 'expired'
      where status = 'open'
        and created_at < now() - (${opts.expiryDays} || ' days')::interval
    `;
    await tx`truncate rec.worklist`;
    const inserted = await tx<{ count: string }[]>`
      with ranked as (
        select
          recommendation_id, agent, rec_type, owner_role, location_id,
          subject_type, subject_id, issue, action,
          expected_dollar_impact, confidence, created_at,
          row_number() over (
            partition by owner_role, location_id
            order by expected_dollar_impact desc, confidence desc, created_at desc
          ) as rank
        from rec.recommendation
        where status = 'open'
          and (snooze_until is null or snooze_until <= current_date)
          and expected_dollar_impact >= ${opts.minDollarImpact}
      )
      insert into rec.worklist (
        recommendation_id, agent, rec_type, owner_role, location_id,
        subject_type, subject_id, issue, action,
        expected_dollar_impact, confidence, created_at, rank
      )
      select
        recommendation_id, agent, rec_type, owner_role, location_id,
        subject_type, subject_id, issue, action,
        expected_dollar_impact, confidence, created_at, rank
      from ranked
      returning 1 as count
    `;
    return inserted.length;
  }) as Promise<number>;
}

export interface WorklistFilter {
  role?: OwnerRole;
  locationId?: string;
  limit: number;
  cursor: number;
}

export async function getWorklist(
  sql: Sql,
  filter: WorklistFilter,
): Promise<WorklistItem[]> {
  const role = filter.role ?? null;
  const locationId = filter.locationId ?? null;
  const rows = await sql<
    {
      recommendation_id: string;
      rank: number;
      agent: string;
      rec_type: string;
      owner_role: OwnerRole;
      location_id: string;
      subject_type: WorklistItem["subjectType"];
      subject_id: string;
      issue: string;
      action: string;
      expected_dollar_impact: string;
      confidence: string;
      created_at: string;
    }[]
  >`
    select
      recommendation_id, rank, agent, rec_type, owner_role, location_id,
      subject_type, subject_id, issue, action,
      expected_dollar_impact, confidence, created_at
    from rec.v_worklist
    where (${role}::text is null or owner_role = ${role})
      and (${locationId}::text is null or location_id = ${locationId})
    order by rank
    offset ${filter.cursor}
    limit ${filter.limit}
  `;
  return rows.map((r) => ({
    recommendationId: r.recommendation_id,
    rank: r.rank,
    agent: r.agent,
    recType: r.rec_type,
    ownerRole: r.owner_role,
    locationId: r.location_id,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    issue: r.issue,
    action: r.action,
    expectedDollarImpact: Number(r.expected_dollar_impact),
    confidence: Number(r.confidence),
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function getRecommendationDetail(
  sql: Sql,
  recommendationId: string,
): Promise<RecommendationDetail | null> {
  const recs = await sql<
    {
      recommendation_id: string;
      agent: string;
      rec_type: string;
      owner_role: RecommendationDetail["ownerRole"];
      location_id: string;
      subject_type: RecommendationDetail["subjectType"];
      subject_id: string;
      issue: string;
      evidence: Record<string, unknown>;
      action: string;
      rationale: string;
      expected_dollar_impact: string;
      confidence: string;
      status: string;
      created_at: string;
      superseded_by: string | null;
    }[]
  >`
    select
      recommendation_id, agent, rec_type, owner_role, location_id,
      subject_type, subject_id, issue, evidence, action, rationale,
      expected_dollar_impact, confidence, status, created_at, superseded_by
    from rec.recommendation
    where recommendation_id = ${recommendationId}
  `;
  const rec = recs[0];
  if (!rec) return null;

  const feedback = await sql<
    {
      action: FeedbackAction;
      reason: string | null;
      outcome: string | null;
      outcome_dollars: string | null;
      actor_role: string | null;
      created_at: string;
    }[]
  >`
    select action, reason, outcome, outcome_dollars, actor_role, created_at
    from rec.recommendation_feedback
    where recommendation_id = ${recommendationId}
    order by created_at desc
  `;

  return {
    recommendationId: rec.recommendation_id,
    agent: rec.agent,
    recType: rec.rec_type,
    ownerRole: rec.owner_role,
    locationId: rec.location_id,
    subjectType: rec.subject_type,
    subjectId: rec.subject_id,
    issue: rec.issue,
    evidence: rec.evidence,
    action: rec.action,
    rationale: rec.rationale,
    expectedDollarImpact: Number(rec.expected_dollar_impact),
    confidence: Number(rec.confidence),
    status: rec.status,
    createdAt: new Date(rec.created_at).toISOString(),
    supersededBy: rec.superseded_by,
    feedback: feedback.map((f) => ({
      action: f.action,
      reason: f.reason,
      outcome: f.outcome,
      outcomeDollars: f.outcome_dollars === null ? null : Number(f.outcome_dollars),
      actorRole: f.actor_role,
      createdAt: new Date(f.created_at).toISOString(),
    })),
  };
}

export interface FeedbackInput {
  recommendationId: string;
  action: FeedbackAction;
  reason?: string | null;
  snoozeUntil?: string | null;
  outcome?: string | null;
  outcomeDollars?: number | null;
  actorRole?: string | null;
  actorEmail?: string | null;
}

const STATUS_BY_ACTION: Record<FeedbackAction, string> = {
  accept: "accepted",
  dismiss: "dismissed",
  snooze: "snoozed",
};

/** Records feedback and transitions the recommendation status atomically. */
export async function recordFeedback(
  sql: Sql,
  input: FeedbackInput,
): Promise<boolean> {
  return sql.begin(async (tx) => {
    const exists = await tx<{ recommendation_id: string }[]>`
      select recommendation_id from rec.recommendation
      where recommendation_id = ${input.recommendationId}
    `;
    if (exists.length === 0) return false;

    await tx`
      insert into rec.recommendation_feedback (
        recommendation_id, action, reason, snooze_until,
        outcome, outcome_dollars, actor_role, actor_email
      ) values (
        ${input.recommendationId}, ${input.action}, ${input.reason ?? null},
        ${input.snoozeUntil ?? null}, ${input.outcome ?? null},
        ${input.outcomeDollars ?? null}, ${input.actorRole ?? null},
        ${input.actorEmail ?? null}
      )
    `;
    await tx`
      update rec.recommendation set
        status = ${STATUS_BY_ACTION[input.action]},
        snooze_until = ${input.snoozeUntil ?? null}
      where recommendation_id = ${input.recommendationId}
    `;
    return true;
  }) as Promise<boolean>;
}

// ---- Learning loop --------------------------------------------------------

export interface FeedbackForLearning {
  recType: string;
  ownerRole: string;
  locationId: string;
  action: FeedbackAction;
  reason: string | null;
  outcome: string | null;
  outcomeDollars: number | null;
  expectedDollarImpact: number;
  feedbackId: string;
  createdAt: string;
}

export async function getFeedbackSince(
  sql: Sql,
  sinceIso: string,
): Promise<FeedbackForLearning[]> {
  const rows = await sql<
    {
      rec_type: string;
      owner_role: string;
      location_id: string;
      action: FeedbackAction;
      reason: string | null;
      outcome: string | null;
      outcome_dollars: string | null;
      expected_dollar_impact: string;
      feedback_id: string;
      created_at: string;
    }[]
  >`
    select
      r.rec_type, r.owner_role, r.location_id, f.action, f.reason, f.outcome,
      f.outcome_dollars, r.expected_dollar_impact, f.feedback_id, f.created_at
    from rec.recommendation_feedback f
    join rec.recommendation r on r.recommendation_id = f.recommendation_id
    where f.created_at >= ${sinceIso}
    order by f.created_at
  `;
  return rows.map((r) => ({
    recType: r.rec_type,
    ownerRole: r.owner_role,
    locationId: r.location_id,
    action: r.action,
    reason: r.reason,
    outcome: r.outcome,
    outcomeDollars: r.outcome_dollars === null ? null : Number(r.outcome_dollars),
    expectedDollarImpact: Number(r.expected_dollar_impact),
    feedbackId: r.feedback_id,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function upsertCalibration(
  sql: Sql,
  params: {
    scopeRole: string | null;
    locationId: string | null;
    recType: string | null;
    paramKey: string;
    paramValue: number;
    source: "default" | "manual" | "learned";
  },
): Promise<void> {
  await sql`
    insert into rec.manager_calibration (
      scope_role, location_id, rec_type, param_key, param_value, source, updated_at
    ) values (
      ${params.scopeRole}, ${params.locationId}, ${params.recType},
      ${params.paramKey}, ${params.paramValue}, ${params.source}, now()
    )
    on conflict (scope_key, param_key) do update set
      param_value = excluded.param_value,
      source = excluded.source,
      updated_at = now()
  `;
}

export async function insertKnowledge(
  sql: Sql,
  k: {
    scopeRole: string | null;
    locationId: string | null;
    recType: string | null;
    title: string;
    body: string;
    sourceFeedbackIds: string[];
    weight: number;
  },
): Promise<void> {
  await sql`
    insert into rec.manager_knowledge (
      scope_role, location_id, rec_type, title, body, source_feedback_ids, weight
    ) values (
      ${k.scopeRole}, ${k.locationId}, ${k.recType}, ${k.title}, ${k.body},
      ${k.sourceFeedbackIds}, ${k.weight}
    )
  `;
}

export async function insertLearningRun(
  sql: Sql,
  summary: {
    feedbackProcessed: number;
    calibrationChanges: number;
    knowledgeCreated: number;
    detail: unknown;
  },
): Promise<void> {
  await sql`
    insert into rec.learning_run (
      ran_at, feedback_processed, calibration_changes, knowledge_created, detail
    ) values (
      now(), ${summary.feedbackProcessed}, ${summary.calibrationChanges},
      ${summary.knowledgeCreated}, ${sql.json(summary.detail as never)}
    )
  `;
}
