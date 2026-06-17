# CarStack API assumptions — TENTATIVE

> ⚠️ Every shape in this document is an **assumption** derived from `CLAUDE.md`,
> not from an authoritative CarStack spec (none is available yet). The CarStack
> client is built to tolerate unknown shapes: unknown fields are preserved
> verbatim into a `payload jsonb` column, missing fields become null, and mappers
> never throw. When the real spec arrives, correct it in **one place** —
> `packages/core/src/carstack/{endpoints.ts, adapters.ts, ../types/carstack.ts}` —
> and nothing else needs to change.

## Base & auth
- Base URL: `https://carstack.io/api/v1/t/Nucar` (env `CARSTACK_API_BASE`).
- Auth: `Authorization: Bearer <CARSTACK_API_KEY>`.
- **403 = scope not enabled** on this key → typed `ScopeNotEnabledError`,
  recorded in the run audit, **not fatal**.
- Pagination: assumed `?page=&limit=` with `limit` capped at **200**; follow
  pages until a short/empty page. The exact param names live in `endpoints.ts`.
- Throttle: `/vdp-enrichment` is per-VIN and rate-limited to **240/min**
  (env `VDP_RATE_PER_MIN`); other endpoints use a looser default bucket.

## Endpoints (assumed)
| Endpoint | Per | Scope notes | → raw table |
|---|---|---|---|
| `/inventory` | location | source of current VINs | `raw.inventory_snapshot` |
| `/vdp-enrichment` | VIN (throttled 240/min) | per-VIN web/price enrichment | `raw.vdp_enrichment_snapshot` |
| `/recon` | VIN (fan-out) | array of recon line items per VIN | `raw.recon_line_item` |
| `/sales-market` | location | **make-level, PMA-scoped, no geo/segment/trim** | `raw.sales_market_snapshot` |
| `/registration` | location | **make/model/year, PMA-scoped** | `raw.registration_snapshot` |
| `/leads` | location | name + city/state; **no VIN, no shared id** | `raw.lead_snapshot` |
| `/deals` | location | name + city/state + VIN + sold date | `raw.deal_snapshot` |
| `/appointments` | location | name + city/state + appt date | `raw.appointment_snapshot` |

> The inventory-list endpoint as the source of VINs for `/vdp-enrichment` and
> `/recon` is an open provider question. If CarStack exposes a different VIN
> source, change `endpoints.ts` (the `inventory` registry entry) only.

## Assumed item shapes (all fields optional / tolerant)
The adapters project a normalized row and stash the whole object in `payload`.
Field names below are the *guessed* source keys; the adapter maps several common
spellings (e.g. `vin`/`VIN`, `list_price`/`price`/`asking_price`).

- **inventory item:** `vin`, `stock_number`, `make`, `model`, `model_year`,
  `mileage`, `list_price`, `cost?`, `status`, `condition`, `first_seen?`
- **vdp-enrichment item:** `vin`, `vdp_views?`, `photo_count?`, `price_changed?`
- **recon item:** `vin`, `line_items: [{ id, description, cost, status }]`
- **sales-market item:** `make`, `units`, `share?`
- **registration item:** `make`, `model`, `model_year`, `units`
- **lead item:** `id`, `customer_name`, `city`, `state`, `source`, `status`,
  `make?`, `model?`, `created_at?`
- **deal item:** `id`, `customer_name`, `city`, `state`, `vin`, `sold_date`
- **appointment item:** `id`, `customer_name`, `city`, `state`, `appt_date`

## Owned Polk table (NOT the API)
`sales_market_salesmarket` is populated by an existing pipeline. Ingestion never
writes it. It is read only by `core.v_demand_radius` and `core.v_conquest_flow`.
The schema file declares a documentation-only `CREATE TABLE IF NOT EXISTS` shell
listing the **expected** columns (geometry, make, model, model_year, segment,
units, period); confirm against the real table and adjust the two views if the
column names differ.
