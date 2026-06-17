# Database — spine schema, migrations, seeds

The Postgres "spine" (Supabase in production, PostGIS required). Schemas:
`raw`, `core`, `ext`, `rec`, `ref`.

## Apply order (fixed)
1. `dealership_spine_schema.sql` — extensions, schemas, `ref.*`, `raw.*` snapshot
   tables, the owned-Polk shell, `core.*` derived views + customer resolution,
   `ext.*` feeds.
2. `migration_002_agents_and_learning.sql` — `rec.recommendation` (the agent
   contract, with the partial-unique `dedupe_key` index), feedback, the
   `rec.worklist` / `rec.v_worklist` read model, and the learning-loop tables.

Both files are idempotent (`CREATE ... IF NOT EXISTS` / `CREATE OR REPLACE`) and
the runner records applied migrations in `public._dip_migrations`.

## Commands
```bash
# Requires DATABASE_URL (see ../.env.example). Local: pnpm stack:up first.
pnpm --filter @dip/db migrate          # apply 001 then 002
pnpm --filter @dip/db migrate -- --force   # re-apply even if recorded
pnpm --filter @dip/db seed             # reference + demo seeds
pnpm --filter @dip/db seed -- --no-demo    # reference seeds only
```

## Prerequisites
- **PostGIS** must be available (`create extension postgis`). The local
  docker-compose uses `postgis/postgis:16-3.4`; Supabase has PostGIS built in.
- `pgcrypto` (for `gen_random_uuid()`) and `pg_trgm` are also enabled by 001.

## Notes
- **Owned Polk table** `public.sales_market_salesmarket` is populated by an
  existing pipeline. Migration 001 creates only a documentation-only
  `IF NOT EXISTS` shell and never writes it; it is read solely by
  `core.v_demand_radius` / `core.v_conquest_flow`. Confirm the real column names
  match the shell before relying on the geo views (Rule 2).
- The `demo_owned_polk.sql` seed inserts demo rows (id 9001–9006) so the demand
  views return data locally. Do **not** run it against a real owned table.
