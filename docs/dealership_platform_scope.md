# Dealership Platform — Scope & Specs

This is the "full detail" referenced by `CLAUDE.md`. It defines the spine, the
agents, the roles and worklist, and the build phases.

## 1. Goal & KPIs
Serve each dealership role a **daily, dollar-ranked worklist** of recommended
actions, so the group:
- turns inventory faster (lower average days-on-lot),
- carries fewer **aged** and fewer **unpriced** units,
- converts more leads (lead → appointment → deal),
- protects **gross** (front + back / F&I).

Each recommendation is attributable (which agent, which evidence) and measurable
(an `expected_dollar_impact`), and its outcome feeds the learning loop.

## 2. The spine (Postgres schemas)
- **`raw.*`** — append-only daily snapshots pulled from CarStack. One row per
  entity per `snapshot_date` per `location_id`. Verbatim `payload jsonb` retained.
- **`core.*`** — DERIVED truth: current inventory, days-on-lot, price-change
  history, velocity, PostGIS demand/conquest, customer resolution. No raw history
  is stored — it is computed from the snapshot series.
- **`ext.*`** — three external feeds not in CarStack: GA/VDP web analytics,
  gross/F&I from the DMS, photos from the website. Each agent that needs one
  fails soft until the feed is wired (`ext.v_feed_readiness`).
- **`ref.*`** — reference & seed data: rooftops/locations (with geometry + PMA
  radius), roles, makes/models, recommendation-type taxonomy, feedback actions.
- **`rec.*`** — the agent output contract (`rec.recommendation`), feedback,
  the ranked worklist, and the learning-loop tables.

## 3. Agents
An agent = deterministic **trigger SQL** that flags + pre-aggregates rows, plus a
**Claude synthesis** step that turns the ranked slice into structured
recommendations. The model never does arithmetic (see `data_rules.md`).

| Agent | Owner role | Needs | Status |
|---|---|---|---|
| **stocking** | inventory / used-car mgr | `core.v_demand_radius`, `core.v_conquest_flow`, `core.v_velocity`, `core.v_inventory_current` | data-ready |
| **pricing** | used-car / sales mgr | `core.v_inventory_current`, `core.v_price_changes`, `core.v_days_on_lot`, `core.v_velocity` | data-ready |
| **aged-inventory** | used-car mgr | `core.v_days_on_lot`, `core.v_price_changes` | data-ready |
| **lead-conversion** | bdc / sales mgr | `core.v_customer_journey`, `raw.lead_snapshot` | data-ready |
| **conquest** | gm / new-car mgr | `core.v_conquest_flow`, `core.v_demand_radius` | data-ready |
| **photos** | inventory mgr | `ext.photos` | fail-soft (needs photos feed) |
| **gross-fi** | gm / finance mgr | `ext.gross_fi` | fail-soft (needs DMS feed) |
| **ga-vdp** | marketing / bdc mgr | `ext.ga_vdp` | fail-soft (needs GA feed) |

Each agent declares `requiresExt: string[]`; if any required feed is not ready it
records a skip and produces nothing (no error).

## 4. Roles & worklist
Roles (`ref.role`): `gm`, `used_car_mgr`, `new_car_mgr`, `sales_mgr`, `bdc_mgr`,
`inventory_mgr`, `finance_mgr`, `marketing_mgr`. The GM sees every recommendation;
other roles see only their `owner_role` slice.

`rec.v_worklist` is the read model: open, non-snoozed recommendations ranked
within `(owner_role, location_id)` by `expected_dollar_impact desc, confidence desc`.
The orchestrator owns the ranking and refreshes the backing `rec.worklist` table.

## 5. Build phases
0. **Foundation** — monorepo, `@dip/core`, docker-compose (Postgres+PostGIS, mock
   CarStack), CI, migration `001` + runner.
1. **Ingestion (gates everything)** — defensive CarStack client + nightly worker:
   per-`location_id` loop, pagination max 200, 240/min throttle on
   `/vdp-enrichment`, recon line-item fan-out, idempotent daily snapshots,
   403-fail-soft, audit. Verified against the mock server + local PostGIS.
2. **Data-ready agents + contract** — migration `002`; agents framework +
   stocking + pricing (+ aged-inventory, lead-conversion, conquest); orchestrator;
   api + web worklist. End-to-end loop.
3. **External feeds (parallel)** — `ext.*` loaders + `ext.feed_status`.
4. **Feed-dependent agents** — photos, gross/F&I, GA/VDP flip on per feed.
5. **Learning loop** — calibration retuning + knowledge growth + outcome checks.

## 6. Open provider questions (block exactness, not the build)
- Shared `customer_id` across leads/deals/appointments? (today: fuzzy match)
- Do leads carry VIN(s)? (today: no)
- Is there an inventory-list endpoint to source VINs for `/vdp-enrichment`?
- Confirmed column names of the owned `sales_market_salesmarket` Polk table.

Until answered, the affected code paths are isolated behind adapters / a single
SQL function / two views so each is a one-place correction (see
`carstack_api_assumptions.md` and `data_rules.md`).
