# Deployment — Vercel + Supabase (via Vercel) + Eve

Target topology:
- **Web** (`web/`) → a Vercel static project (Vite).
- **API** (`services/api/`) → a Vercel project; the Fastify app runs as a Node
  serverless function (`api/[...path].ts`), plus an ingestion cron
  (`api/cron/ingest.ts`).
- **Database** → **Supabase**, provisioned through the **Vercel Marketplace
  integration** (it injects the DB connection env var automatically).
- **Decision agents** → **Eve** projects (see `eve/`).

> Why this finally fixes the `DATABASE_URL` crashes: the code now reads the DB
> URL from whatever the host injects — `DATABASE_URL`, `POSTGRES_URL`,
> `SUPABASE_DB_URL`, `POSTGRES_PRISMA_URL`, or `POSTGRES_URL_NON_POOLING`
> (`packages/core/src/config/env.ts`). The Vercel↔Supabase integration sets one
> of these for you, so there's no per-service hand-wiring.

## 1. Supabase via Vercel
1. Vercel project → **Integrations** → add **Supabase** (Marketplace) → create/
   link a project. It injects the Postgres URL env vars into all environments.
2. In Supabase, enable **PostGIS** (Database → Extensions → `postgis`).
   `pgcrypto` and `pg_trgm` are available; migration `001` enables them.
3. Set the api's own secrets in Vercel: `SUPABASE_JWT_SECRET` (to verify user
   JWTs), `CORS_ORIGIN` (the web origin), `ANTHROPIC_API_KEY` (for Eve / agents),
   `CARSTACK_API_KEY` + `CARSTACK_API_BASE` (ingestion), and optionally
   `CRON_SECRET` (protects the ingest cron).

## 2. API project (`services/api/`)
Create a Vercel project with **Root Directory = `services/api`**. Settings come
from `services/api/vercel.json`:
- **Install:** `cd ../.. && pnpm install --frozen-lockfile`
- **Build:** `cd ../.. && pnpm turbo build --filter=@dip/api... --filter=@dip/ingestion... && pnpm db:migrate`
  — build first (so `@dip/core` is compiled before `migrate.ts` imports it), then
  migrations run on every deploy (idempotent, tracked in `public._dip_migrations`,
  using the non-pooling URL via `loadMigrationDatabaseUrl()`).
- **Functions:** `api/**` with `maxDuration: 300`.
- **Rewrite:** all paths → `/api/$1` (the catch-all Fastify function).
- **Cron:** `/api/cron/ingest` nightly.

`api/[...path].ts` wraps `buildServer()` (from `src/server.ts`) — every existing
route works unchanged: `GET /healthz`, `/readyz`, `/worklist`,
`/recommendations/:id`, `POST /recommendations/:id/feedback`, `/meta/*`.

> Monorepo note: if Vercel's file tracing misses workspace files, set
> `outputFileTracingRoot` to the repo root (or move to a single Vercel project).

## 3. Web project (`web/`)
Vercel project with **Root Directory = `web`**, settings from `web/vercel.json`
(Vite build via turbo, output `web/dist`, SPA rewrite to `index.html`). Set
`VITE_API_BASE_URL` to the API project's URL.

## 4. Ingestion
`api/cron/ingest.ts` reuses `runIngestion`. Hit `/api/cron/ingest?location=<id>`
to ingest one rooftop (stays under the function cap); the nightly cron with no
param ingests all active locations sequentially. For many rooftops or long
240/min VDP throttle windows, run ingestion as an **Eve durable workflow**
instead (checkpoint/resume) — see `eve/`.

## 5. Agents (Eve)
See **`eve/README.md`**. Each decision agent is an Eve project whose tools reuse
the deterministic trigger SQL + `@dip/core` repos (so the "LLM never does
arithmetic" rule holds); `schedules/` runs them nightly. The orchestrator
(`recRepo.refreshWorklist`) and weekly learning loop become Eve schedules too.

## 6. Seed reference data (once)
```bash
vercel env pull .env.local            # pulls the injected Supabase URL
pnpm --filter @dip/db seed -- --no-demo   # after editing db/seeds/ref_locations.sql
```

## Verify
1. Deploy the API project → build log shows `Migrations complete.`
2. `GET /healthz` → `{"status":"ok"}`; `/readyz` → `{"status":"ready"}` (DB reachable).
3. `GET /meta/locations` lists your rooftops (after seeding).
4. Run the ingest cron for one rooftop, run the Eve agent(s), then
   `GET /worklist?role=<role>` returns the ranked worklist.

(The Railway runbook in `DEPLOYMENT.md` still works if you prefer Railway; this
file is the Vercel path.)
