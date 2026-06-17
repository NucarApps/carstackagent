# Dealership Intelligence Platform

A multi-rooftop dealership intelligence platform. It unifies CRM, inventory, web,
registration, and sales data onto a Postgres **spine**, runs decision **agents**
(stocking, pricing, conquest, …) on top, and serves each role a daily,
**dollar-ranked worklist** of recommended actions.

> Goal: faster inventory turn, fewer aged/unpriced units, higher lead conversion,
> protected gross.

## Architecture

```
CarStack API ──nightly──▶ raw.*  (append-only daily snapshots)
                              │
                              ▼
                          core.*  (DERIVED: days-on-lot, price history, velocity,
                              │     PostGIS demand/conquest, customer resolution)
   ext.* (GA/VDP, gross/F&I, photos — fail-soft)
                              │
              agents ────────▶ rec.recommendation  (LLM synthesis over a
                              │   pre-aggregated, SQL-flagged slice)
                              ▼
         orchestrator ──dedupe+rank──▶ rec.v_worklist
                              │
                  api (Fastify) ──▶ web (React worklist UI) ──▶ rec.recommendation_feedback
                              │
              learning loop (weekly): retune rec.manager_calibration,
                                      grow rec.manager_knowledge (RAG, never fine-tune)
```

- **Data layer:** Supabase Postgres + PostGIS. Schemas `raw`, `core`, `ext`, `rec`, `ref`.
- **Compute layer (Railway):** `ingestion` (cron), `agents` (cron), `orchestrator` (cron), `api` (web).
- **Frontend:** Vite + React + TypeScript + Tailwind.
- **LLM:** Anthropic Claude (`claude-opus-4-8`) — structured outputs; the model never does arithmetic.

See [`CLAUDE.md`](./CLAUDE.md) for the build guide and the five non-negotiable data rules,
and [`docs/`](./docs) for the scope, learning spec, data rules, and CarStack API assumptions.

## Monorepo layout

| Path | What |
|---|---|
| `packages/core` | `@dip/core` — types, DB client, config, logging, LLM wrapper, **CarStack client/adapters** |
| `packages/testkit` | `@dip/testkit` — Postgres test harness, factories, mock CarStack server |
| `db` | `@dip/db` — SQL migrations (`001`, `002`), seeds, ordered runner |
| `services/ingestion` | CarStack → `raw.*` nightly cron worker (**Phase 1, gates everything**) |
| `services/agents` | trigger SQL → Claude synthesis → `rec.recommendation`; weekly learning loop |
| `services/orchestrator` | dedupe + rank → `rec.worklist` / `rec.v_worklist` |
| `services/api` | Fastify BFF: worklist, recommendation detail, feedback |
| `web` | React worklist UI |

## Quick start (local)

```bash
nvm use                       # Node 22
pnpm install
cp .env.example .env.local    # fill in CARSTACK_API_KEY / ANTHROPIC_API_KEY if you have them

pnpm stack:up                 # Postgres+PostGIS + mock CarStack (docker)
pnpm db:migrate               # apply 001 then 002
pnpm db:seed                  # reference + demo seed data

pnpm ingest                   # pull (mock) CarStack into raw.*
pnpm agents                   # generate recommendations
pnpm orchestrate              # dedupe + rank → worklist
pnpm dev:api                  # Fastify on :8080
pnpm dev:web                  # Vite on :5173
```

To run ingestion against the mock server, set in `.env.local`:

```
CARSTACK_API_BASE=http://localhost:8787/api/v1/t/Nucar
CARSTACK_API_KEY=dev-mock-key
```

## Tooling

```bash
pnpm build       # turbo build (tsc project references)
pnpm typecheck   # strict TS across all packages
pnpm lint        # eslint
pnpm test        # vitest (uses local Postgres+PostGIS)
```

## Deployment

Each compute service deploys as a **Railway cron worker** (run-once-and-exit); `api`
is the always-on web service; `web` is a static build. Migrations apply to Supabase
via `pnpm db:migrate`. See [`db/README.md`](./db/README.md) and each service's
`railway.toml`.
