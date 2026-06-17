# CLAUDE.md — Dealership Intelligence Platform

## What this is
A multi-rooftop dealership intelligence platform. It unifies CRM, inventory,
web, registration, and sales data onto a Postgres "spine," runs decision agents
(stocking, pricing, conquest, and more) on top, and serves each role a daily,
dollar-ranked worklist of recommended actions. Goal: faster inventory turn,
fewer aged/unpriced units, higher lead conversion, protected gross.

## Stack & hosting
- **Data layer — Supabase Postgres.** The spine: schemas `raw`, `core`, `ext`,
  `rec`, `ref`, plus views and PostGIS. Managed; keep it here.
- **Compute layer — Railway services:**
  - `ingestion` (nightly cron worker): pulls CarStack into `raw.*`.
  - `agents` (runner): trigger SQL + Anthropic API synthesis → `rec.recommendation`.
  - `orchestrator`: dedupe + rank → `rec.v_worklist`.
  - `api`: backend for the frontend; reads worklists, writes feedback.
- **Frontend:** React worklist UI (Vite), reads `rec.v_worklist`,
  writes to `rec.recommendation_feedback`.
- **LLM:** Anthropic API (Claude, `claude-opus-4-8`) for agent reasoning.
- Secrets (CarStack key, DB URL, `ANTHROPIC_API_KEY`) live in env vars, never in code.

## Repo layout
- `/db` — schema + migrations, applied in order:
  - `dealership_spine_schema.sql`
  - `migration_002_agents_and_learning.sql`
- `/docs` — scope + specs:
  - `dealership_platform_scope.md`
  - `interaction_and_learning_spec.md`
  - `data_rules.md`, `carstack_api_assumptions.md`
- `/packages` — shared workspace packages: `@dip/core` (types, db, config,
  logging, LLM wrapper, CarStack client/adapters), `@dip/testkit` (fixtures + mock).
- `/services` — Railway services: `ingestion`, `agents`, `orchestrator`, `api`
- `/web` — frontend

## Non-negotiable data rules (read before building)
1. **Snapshot, don't mirror.** CarStack is current-state only. Ingestion appends
   a daily row; history (price changes, days-on-lot, velocity) is DERIVED from
   the snapshot series in `core.*`.
2. **Two-path Polk.** The CarStack API (`/sales-market` make-level,
   `/registration` model-level) is PMA-scoped server-side and strips geo and
   segment. Anything geo (the per-store radius, conquest flow) or segment-level
   reads the OWNED table `sales_market_salesmarket` directly via PostGIS — NOT
   the API. See `core.v_demand_radius`, `core.v_conquest_flow`.
3. **No trim.** Polk collapses trim to model. All demand and competitive
   analysis is make / model / model_year.
4. **Customer identity is fuzzy.** No shared `customer_id` across
   leads/deals/appointments (only name + city/state); leads carry no VIN.
   Resolve in `core.entity_customer` / `core.customer_match`. Upgrade to an exact
   id IF CarStack enables one.
5. **Three external gaps (`ext.*`):** GA/VDP views, gross/F&I (DMS), photos
   (website). Agents needing them fail soft until each feed is wired.

## Build order
**Phase 1 first — it gates everything:** the ingestion worker that fills `raw.*`
(per-`location_id` loop, pagination max 200, 240/min throttle on
`/vdp-enrichment`, recon line-item fan-out, idempotent daily snapshots). Build it
as a **Railway cron service, NOT a Supabase Edge Function** — the job runs past
Edge time limits.

Then: stocking + pricing agents (data-ready), orchestrator + worklist UI, the
external feeds (parallel track), the feed-dependent agents, the learning loop.
Full detail in `/docs/dealership_platform_scope.md`.

## External dependencies
- CarStack API base: `https://carstack.io/api/v1/t/Nucar` — Bearer key. Confirm
  which scopes are enabled (403 = not enabled on this key).
- Open provider questions: shared `customer_id` on leads/deals/appointments?
  lead VIN(s)? an inventory-list endpoint (source of VINs for `/vdp-enrichment`)?
- The owned Polk table `sales_market_salesmarket` is already populated by an
  existing pipeline; verify its column names match the geo views before relying
  on them.

## Conventions
- Deterministic SQL produces the flagged rows; the LLM is fed the ranked,
  pre-aggregated slice and returns structured recommendations (issue, evidence,
  action, rationale, expected $ impact, confidence). The model NEVER does
  arithmetic over many rows.
- `rec.recommendation` is the agent output contract — every agent writes there
  with a `dedupe_key` and `owner_role`.
- The learning loop never fine-tunes. It retunes SQL thresholds
  (`rec.manager_calibration`), grows a retrieved knowledge base
  (`rec.manager_knowledge`), and checks against outcomes. See
  `/docs/interaction_and_learning_spec.md`.

## Working in this repo
- `pnpm install` then `pnpm build`. `pnpm typecheck` / `pnpm lint` / `pnpm test`.
- `pnpm stack:up` starts local Postgres+PostGIS and the mock CarStack server.
- `pnpm db:migrate && pnpm db:seed` applies the schema and reference seeds.
- Run a service locally: `pnpm ingest`, `pnpm agents`, `pnpm orchestrate`, `pnpm dev:api`, `pnpm dev:web`.
