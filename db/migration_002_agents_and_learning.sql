-- ===========================================================================
-- Migration 002 — Agent output contract, worklist, and learning loop (rec.*)
-- Depends on migration 001 (rec schema + ref.* tables already exist).
-- Idempotent: safe to re-run.
-- ===========================================================================

-- The agent output contract. Every agent writes here with a dedupe_key and
-- owner_role. The partial unique index guarantees ONE open recommendation per
-- dedupe_key at the database level (a same-key write refreshes it in place).
create table if not exists rec.recommendation (
  recommendation_id      uuid primary key default gen_random_uuid(),
  agent                  text not null,
  rec_type               text not null references ref.recommendation_type(rec_type),
  owner_role             text not null references ref.role(owner_role),
  location_id            text not null references ref.location(location_id),
  subject_type           text not null check (subject_type in ('vin','make_model','customer','segment')),
  subject_id             text not null,
  dedupe_key             text not null,
  issue                  text not null,
  evidence               jsonb not null,   -- the pre-aggregated numbers shown to the model
  action                 text not null,
  rationale              text not null,
  expected_dollar_impact numeric not null,
  confidence             numeric not null check (confidence >= 0 and confidence <= 1),
  status                 text not null default 'open'
                           check (status in ('open','superseded','accepted','dismissed','snoozed','expired')),
  snooze_until           date,
  generated_run_id       uuid,
  created_at             timestamptz not null default now(),
  superseded_by          uuid references rec.recommendation(recommendation_id)
);

create unique index if not exists rec_open_dedupe
  on rec.recommendation (dedupe_key) where status = 'open';

create index if not exists ix_rec_worklist
  on rec.recommendation (owner_role, location_id, status, expected_dollar_impact desc);

-- Manager feedback + later-observed outcome.
create table if not exists rec.recommendation_feedback (
  feedback_id       uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references rec.recommendation(recommendation_id),
  action            text not null references ref.feedback_action(action),
  reason            text,
  snooze_until      date,
  outcome           text,
  outcome_dollars   numeric,
  actor_role        text,
  actor_email       text,
  created_at        timestamptz not null default now()
);
create index if not exists ix_feedback_rec
  on rec.recommendation_feedback (recommendation_id);
create index if not exists ix_feedback_created
  on rec.recommendation_feedback (created_at);

-- Dedup+rank read model. The orchestrator rebuilds rec.worklist; rec.v_worklist
-- is the contract-named view the api reads.
create table if not exists rec.worklist (
  recommendation_id      uuid primary key,
  agent                  text not null,
  rec_type               text not null,
  owner_role             text not null,
  location_id            text not null,
  subject_type           text not null,
  subject_id             text not null,
  issue                  text not null,
  action                 text not null,
  expected_dollar_impact numeric not null,
  confidence             numeric not null,
  created_at             timestamptz not null,
  rank                   int not null
);
create index if not exists ix_worklist_role_loc_rank
  on rec.worklist (owner_role, location_id, rank);

create or replace view rec.v_worklist as
select
  recommendation_id, agent, rec_type, owner_role, location_id,
  subject_type, subject_id, issue, action,
  expected_dollar_impact, confidence, created_at, rank
from rec.worklist;

-- ---------------------------------------------------------------------------
-- Learning loop (never fine-tunes). See docs/interaction_and_learning_spec.md.
-- ---------------------------------------------------------------------------

-- Retunable SQL thresholds. scope_key (generated) makes the coalesced scope a
-- single unique target for upserts; the most-specific row wins at read time.
create table if not exists rec.manager_calibration (
  calibration_id uuid primary key default gen_random_uuid(),
  scope_role     text,
  location_id    text,
  rec_type       text,
  param_key      text not null,
  param_value    numeric not null,
  source         text not null default 'default'
                   check (source in ('default','manual','learned')),
  updated_at     timestamptz not null default now(),
  scope_key      text generated always as (
                   coalesce(scope_role,'*') || '|' ||
                   coalesce(location_id,'*') || '|' ||
                   coalesce(rec_type,'*')
                 ) stored,
  unique (scope_key, param_key)
);

-- Retrieved knowledge base (RAG). Injected into the agent system prompt.
create table if not exists rec.manager_knowledge (
  knowledge_id        uuid primary key default gen_random_uuid(),
  scope_role          text,
  location_id         text,
  rec_type            text,
  title               text not null,
  body                text not null,
  source_feedback_ids text[] not null default '{}',
  weight              numeric not null default 1,
  created_at          timestamptz not null default now()
);
create index if not exists ix_knowledge_scope
  on rec.manager_knowledge (rec_type, scope_role);

-- Audit of each learning run.
create table if not exists rec.learning_run (
  learning_run_id     uuid primary key default gen_random_uuid(),
  ran_at              timestamptz not null default now(),
  feedback_processed  int not null default 0,
  calibration_changes int not null default 0,
  knowledge_created   int not null default 0,
  detail              jsonb not null default '{}'::jsonb
);
