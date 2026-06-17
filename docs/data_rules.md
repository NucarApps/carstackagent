# Non-negotiable data rules (and where they are enforced)

These five rules from `CLAUDE.md` are load-bearing. This doc records exactly
where each is enforced so a reviewer can verify it and a future change knows the
single place to touch.

## Rule 1 — Snapshot, don't mirror
CarStack is current-state only. Ingestion **appends** one row per entity per day;
history is **derived**, never stored raw.

- **Enforced in:** every `raw.*` table has grain `(snapshot_date, location_id,
  natural_key)` with a unique constraint; ingestion writes via
  `INSERT … ON CONFLICT (grain) DO UPDATE` (`services/ingestion/src/snapshot.ts`).
- **Derivation lives in:** `core.v_days_on_lot`, `core.v_price_changes` /
  `core.v_price_history`, `core.v_velocity`, `core.v_inventory_current`
  (`db/dealership_spine_schema.sql`).
- `snapshot_date` comes from an **injectable clock** (`@dip/core` `time/clock.ts`)
  so backfills target a specific date deterministically and tests are stable.

## Rule 2 — Two-path Polk
The CarStack API (`/sales-market` make-level, `/registration` model-level) is
PMA-scoped server-side and strips geo + segment. Anything geo (per-store radius,
conquest flow) or segment-level reads the **owned** table
`sales_market_salesmarket` directly via PostGIS — NOT the API.

- **API path:** `raw.sales_market_snapshot` (make), `raw.registration_snapshot`
  (make/model/year). These carry NO geo, NO segment, NO trim.
- **Owned path:** `core.v_demand_radius` and `core.v_conquest_flow` are the ONLY
  objects that read `sales_market_salesmarket`. A column correction is therefore a
  two-view edit. Ingestion never writes the owned table.

## Rule 3 — No trim
Polk collapses trim to model. All demand and competitive analysis is
make / model / model_year.

- **Enforced in:** `ref.model` PK is `(make, model)` only; velocity/registration
  grains are `(make, model, model_year)`; no `trim` column exists anywhere in the
  analysis path.

## Rule 4 — Customer identity is fuzzy
No shared `customer_id` across leads/deals/appointments (only name + city/state);
leads carry no VIN.

- **Enforced in:** `core.entity_customer` + `core.customer_match`, built by the
  single function `core.fn_resolve_customers()` (normalized name + city/state +
  `pg_trgm` similarity, with a `match_score`/`match_method`).
- **Upgrade path:** if CarStack enables an exact id, swap the body of
  `fn_resolve_customers()` to key on it (score 1.0). Consumers read
  `core.v_customer_journey`, so nothing downstream changes.

## Rule 5 — Three external gaps (fail soft)
GA/VDP web analytics, gross/F&I (DMS), photos (website) are not in CarStack.

- **Enforced in:** `ext.ga_vdp`, `ext.gross_fi`, `ext.photos`, plus
  `ext.feed_status` / `ext.v_feed_readiness`. Agents declare `requiresExt[]`; the
  agents framework (`services/agents/src/framework/failsoft.ts`) skips an agent
  whose required feeds are not ready — it records a skip, never an error.

## Cross-cutting — "the LLM never does arithmetic"
All arithmetic (days-on-lot, markdown totals, velocity, demand-vs-supply,
conquest gap, base `expected_dollar_impact`) is computed in the deterministic
trigger SQL. The model receives only the pre-aggregated slice and **selects** /
explains; `services/agents/src/framework/synth.ts` post-validates that every
returned `expected_dollar_impact` traces to a supplied evidence value — on
mismatch the SQL figure wins and confidence is lowered.
