# Deployment — Railway + Supabase

The data layer is **Supabase Postgres (+ PostGIS)**; the compute services run on
**Railway**. Migrations are applied automatically as the **api service's
pre-deploy command** — there is no standalone migration service.

> Hit `DATABASE_URL: Required`? That variable isn't set on the service. Railway
> variables are per-service; set `DATABASE_URL` (see below) on every service that
> talks to the database.

## 1. Supabase

1. Create a Supabase project.
2. **Enable PostGIS:** Dashboard → Database → Extensions → enable `postgis`.
   (`pgcrypto` and `pg_trgm` are available; migration `001` enables them.)
3. Grab the connection string: Dashboard → Database → Connect.
   - Use the **Session pooler** URI (recommended — supports everything).
   - The **Transaction pooler** also works now (the client sets `prepare:false`).
   - Append `?sslmode=require`. Example:
     `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require`

   This value is your `DATABASE_URL`.

## 2. Railway variables

Railway variables are **per-service**. Define `DATABASE_URL` once as a
**project shared variable**, then reference it from each service:

```
DATABASE_URL = ${{ shared.DATABASE_URL }}
```

Per-service secrets to add:

| Service        | Variables |
|----------------|-----------|
| `api`          | `DATABASE_URL`, `SUPABASE_JWT_SECRET`, `CORS_ORIGIN`, `PORT` |
| `agents`       | `DATABASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (opt), `AGENTS_ENABLED` (opt) |
| `orchestrator` | `DATABASE_URL`, `WORKLIST_EXPIRY_DAYS` (opt), `MIN_DOLLAR_IMPACT` (opt) |
| `ingestion`    | `DATABASE_URL`, `CARSTACK_API_KEY`, `CARSTACK_API_BASE` |
| `web`          | `VITE_API_BASE_URL` (build-time; the public api URL) |

`agents` runs deterministically without `ANTHROPIC_API_KEY` (fallback synthesis);
set the key to enable Claude.

## 3. Railway services

Create one Railway service per app, each from this repo with **Root Directory =
repo root** (the build commands use turbo filters against the whole workspace).
Config-as-code lives in each service's `railway.toml`:

| Service        | railway.toml path                  | Type | Schedule (cron) |
|----------------|------------------------------------|------|-----------------|
| `api`          | `services/api/railway.toml`        | web (always-on) + **pre-deploy migrate** | — |
| `ingestion`    | `services/ingestion/railway.toml`  | cron | `0 2 * * *` |
| `agents`       | `services/agents/railway.toml`     | cron | `30 3 * * *` |
| `orchestrator` | `services/orchestrator/railway.toml`| cron | `30 4 * * *` |
| `web`          | static (Vite build → `web/dist`)   | static | — |

Point each service at its `railway.toml` (Settings → Config-as-code path), or
set the build/start commands shown in those files manually.

> **Migrations:** `services/api/railway.toml` sets
> `preDeployCommand = "pnpm db:migrate"`. On each api deploy, Railway runs the
> migrations against `DATABASE_URL` **before** the new version goes live; a
> failure fails the deploy. **Delete any standalone `@dip/db` service** — it is
> no longer needed (and as a normal service it would restart-loop, since it
> exits after migrating).

The weekly learning loop is an optional extra cron on the agents build:
`startCommand = node services/agents/dist/learning.js`, schedule `0 5 * * 1`.

## 4. Seed reference data (once)

Migrations create the schema; reference rows (roles, recommendation types, feed
status, calibration defaults, and your rooftops) are seeded separately because
locations are environment-specific. Edit `db/seeds/ref_locations.sql` for your
real stores, then run once (omit demo Polk rows in production):

```bash
# Railway one-off (CLI) against the api service environment:
railway run --service api pnpm --filter @dip/db seed -- --no-demo
```

## 5. Verify

1. Redeploy `api`. The **pre-deploy** log shows:
   `apply dealership_spine_schema.sql … migration_002 … Migrations complete.`
2. `GET /healthz` → `{"status":"ok"}`; `GET /readyz` → `{"status":"ready"}`
   (confirms the api reaches Supabase).
3. After seeding: `GET /meta/locations` lists your rooftops.
4. Once `ingestion` → `agents` → `orchestrator` have run (trigger manually first
   if you don't want to wait for cron), `GET /worklist?role=<role>` returns the
   dollar-ranked worklist.

## Troubleshooting

- **`DATABASE_URL: Required`** — variable not set on that service. See §2.
- **`type "geometry" does not exist`** — PostGIS not enabled in Supabase (§1) or
  the migration ran before the extension existed. The migrate runner sets
  `search_path` to include `extensions`; enable PostGIS and redeploy.
- **`prepared statement "…" does not exist`** — a transaction-pooler symptom; the
  client already sets `prepare:false`, so ensure the deployed build is current.
- **A standalone `@dip/db` service keeps crashing/looping** — delete it;
  migrations run via the api pre-deploy command now.
