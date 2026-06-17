-- ===========================================================================
-- Migration 001 — Dealership spine schema
-- Schemas: raw, core, ext, ref (+ rec shells; the rec contract is migration 002)
-- Idempotent: safe to re-run (CREATE ... IF NOT EXISTS / CREATE OR REPLACE).
-- ===========================================================================

create extension if not exists postgis;
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;     -- fuzzy customer match (Rule 4)

create schema if not exists raw;
create schema if not exists core;
create schema if not exists ext;
create schema if not exists rec;   -- contract + learning loop live in migration 002
create schema if not exists ref;

-- ---------------------------------------------------------------------------
-- ref.* — reference & seed data
-- ---------------------------------------------------------------------------
create table if not exists ref.location (
  location_id   text primary key,
  store_name    text not null,
  rooftop_code  text,
  geom          geometry(Point, 4326),   -- store location for PMA-radius demand
  radius_miles  numeric not null default 25,
  pma_zip       text,
  active        boolean not null default true
);

create table if not exists ref.role (
  owner_role   text primary key,
  display_name text not null,
  description  text,
  sort_order   int not null default 100
);

create table if not exists ref.make ( make text primary key );

-- No trim anywhere (Rule 3): the model grain is (make, model) only.
create table if not exists ref.model (
  make  text not null references ref.make(make),
  model text not null,
  primary key (make, model)
);

create table if not exists ref.recommendation_type (
  rec_type        text primary key,
  agent           text not null,
  owner_role      text not null references ref.role(owner_role),
  default_enabled boolean not null default true,
  requires_ext    text[] not null default '{}'   -- ext feeds gating this agent
);

create table if not exists ref.feedback_action ( action text primary key );

-- ---------------------------------------------------------------------------
-- raw.* — append-only daily snapshots (Rule 1). Grain = (snapshot_date,
-- location_id, natural_key). Idempotent writes via ON CONFLICT DO UPDATE.
-- Every row keeps the verbatim source object in `payload jsonb` (escape hatch).
-- ---------------------------------------------------------------------------
create table if not exists raw.ingestion_run (
  run_id              uuid primary key,
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  status              text not null default 'running',
  locations_processed int not null default 0,
  rows_written        int not null default 0,
  errors              jsonb not null default '[]'::jsonb,
  endpoint_stats      jsonb not null default '{}'::jsonb
);

create table if not exists raw.inventory_snapshot (
  snapshot_date  date not null,
  location_id    text not null references ref.location(location_id),
  vin            text not null,
  stock_number   text,
  make           text,
  model          text,
  model_year     int,
  mileage        int,
  list_price     numeric,
  cost           numeric,
  status         text,
  condition      text,
  first_seen_hint date,
  ingested_at    timestamptz not null default now(),
  source_run_id  uuid,
  payload        jsonb not null,
  primary key (snapshot_date, location_id, vin)
);
create index if not exists ix_inventory_vin
  on raw.inventory_snapshot (location_id, vin, snapshot_date desc);

create table if not exists raw.vdp_enrichment_snapshot (
  snapshot_date      date not null,
  location_id        text not null references ref.location(location_id),
  vin                text not null,
  vdp_views          int,
  photo_count        int,
  price_changed_flag boolean,
  ingested_at        timestamptz not null default now(),
  source_run_id      uuid,
  payload            jsonb not null,
  primary key (snapshot_date, location_id, vin)
);

create table if not exists raw.recon_line_item (
  snapshot_date date not null,
  location_id   text not null references ref.location(location_id),
  vin           text not null,
  line_item_id  text not null,
  description   text,
  cost          numeric,
  status        text,
  ingested_at   timestamptz not null default now(),
  source_run_id uuid,
  payload       jsonb not null,
  primary key (snapshot_date, location_id, vin, line_item_id)
);

-- API make-level Polk, PMA-scoped (Rule 2): NO geo, NO segment, NO trim.
create table if not exists raw.sales_market_snapshot (
  snapshot_date date not null,
  location_id   text not null references ref.location(location_id),
  make          text not null,
  units         numeric,
  share         numeric,
  ingested_at   timestamptz not null default now(),
  source_run_id uuid,
  payload       jsonb not null,
  primary key (snapshot_date, location_id, make)
);

-- API model-level Polk, PMA-scoped (Rule 2/3): make/model/model_year.
-- model_year defaults to 0 (= unknown) so it can participate in the PK.
create table if not exists raw.registration_snapshot (
  snapshot_date date not null,
  location_id   text not null references ref.location(location_id),
  make          text not null,
  model         text not null,
  model_year    int not null default 0,
  units         numeric,
  ingested_at   timestamptz not null default now(),
  source_run_id uuid,
  payload       jsonb not null,
  primary key (snapshot_date, location_id, make, model, model_year)
);

create table if not exists raw.lead_snapshot (
  snapshot_date date not null,
  location_id   text not null references ref.location(location_id),
  lead_id       text not null,
  customer_name text,
  city          text,
  state         text,
  source        text,
  status        text,
  make          text,
  model         text,
  created_hint  date,
  ingested_at   timestamptz not null default now(),
  source_run_id uuid,
  payload       jsonb not null,
  primary key (snapshot_date, location_id, lead_id)
);

create table if not exists raw.deal_snapshot (
  snapshot_date date not null,
  location_id   text not null references ref.location(location_id),
  deal_id       text not null,
  customer_name text,
  city          text,
  state         text,
  vin           text,
  sold_date     date,
  ingested_at   timestamptz not null default now(),
  source_run_id uuid,
  payload       jsonb not null,
  primary key (snapshot_date, location_id, deal_id)
);

create table if not exists raw.appointment_snapshot (
  snapshot_date  date not null,
  location_id    text not null references ref.location(location_id),
  appointment_id text not null,
  customer_name  text,
  city           text,
  state          text,
  appt_date      date,
  ingested_at    timestamptz not null default now(),
  source_run_id  uuid,
  payload        jsonb not null,
  primary key (snapshot_date, location_id, appointment_id)
);

-- ---------------------------------------------------------------------------
-- OWNED Polk table (Rule 2). Populated by an EXISTING pipeline — ingestion
-- NEVER writes here. This is a documentation-only shell listing the EXPECTED
-- columns; confirm against the real table and adjust the two geo views below
-- if the names differ. Read ONLY through core.v_demand_radius / v_conquest_flow.
-- ---------------------------------------------------------------------------
create table if not exists public.sales_market_salesmarket (
  id         bigint,
  geom       geometry(Point, 4326),
  make       text,
  model      text,
  model_year int,
  segment    text,
  units      numeric,
  period     date
);

-- ---------------------------------------------------------------------------
-- core.* — DERIVED truth (Rule 1). No raw history is stored; it is computed
-- from the snapshot series.
-- ---------------------------------------------------------------------------

-- Latest inventory row per (location_id, vin).
create or replace view core.v_inventory_current as
select distinct on (location_id, vin)
  location_id, vin, stock_number, make, model, model_year, mileage,
  list_price, cost, status, condition,
  (list_price is null or list_price = 0) as unpriced,
  snapshot_date as as_of, first_seen_hint
from raw.inventory_snapshot
order by location_id, vin, snapshot_date desc;

-- Stable make/model/model_year identity for a vin (latest non-null).
create or replace view core.v_vehicle_identity as
select distinct on (location_id, vin)
  location_id, vin, make, model, model_year
from raw.inventory_snapshot
order by location_id, vin, snapshot_date desc;

-- Days-on-lot derived from the snapshot series (first_seen = min snapshot_date).
-- The "aged" threshold is calibratable per agent, so it is NOT baked in here.
create or replace view core.v_days_on_lot as
with spans as (
  select location_id, vin,
         min(snapshot_date) as first_seen,
         max(snapshot_date) as last_seen,
         count(*)           as snapshot_count
  from raw.inventory_snapshot
  group by location_id, vin
)
select c.location_id, c.vin, c.make, c.model, c.model_year,
       s.first_seen, s.last_seen, s.snapshot_count,
       (current_date - s.first_seen) as days_on_lot
from core.v_inventory_current c
join spans s on s.location_id = c.location_id and s.vin = c.vin;

-- Price history (lag over the snapshot series) and per-vin change summary.
create or replace view core.v_price_history as
select location_id, vin, snapshot_date, list_price,
       lag(list_price) over (
         partition by location_id, vin order by snapshot_date
       ) as prev_price
from raw.inventory_snapshot;

create or replace view core.v_price_changes as
select location_id, vin,
  count(*) filter (
    where prev_price is not null and list_price is distinct from prev_price
  ) as price_change_count,
  max(snapshot_date) filter (
    where prev_price is not null and list_price is distinct from prev_price
  ) as last_price_change_date,
  coalesce(
    sum(greatest(prev_price - list_price, 0)) filter (where prev_price is not null),
    0
  ) as total_markdown
from core.v_price_history
group by location_id, vin;

-- Velocity per (location_id, make, model, model_year) from deal snapshots.
create or replace view core.v_velocity as
with sold as (
  select d.location_id, vi.make, vi.model, vi.model_year, d.sold_date
  from (
    select distinct on (location_id, deal_id)
      location_id, deal_id, vin, sold_date
    from raw.deal_snapshot
    order by location_id, deal_id, snapshot_date desc
  ) d
  join core.v_vehicle_identity vi
    on vi.location_id = d.location_id and vi.vin = d.vin
  where d.sold_date is not null and d.vin is not null
)
select location_id, make, model, model_year,
  count(*) filter (where sold_date >= current_date - 30) as units_sold_30,
  count(*) filter (where sold_date >= current_date - 60) as units_sold_60,
  count(*) filter (where sold_date >= current_date - 90) as units_sold_90
from sold
group by location_id, make, model, model_year;

-- PostGIS demand within each store's PMA radius — reads the OWNED table ONLY
-- (Rule 2), keeping geo + segment that the API path strips.
create or replace view core.v_demand_radius as
select
  l.location_id,
  sm.make, sm.model, sm.model_year, sm.segment,
  sum(sm.units) as demand_units
from ref.location l
join public.sales_market_salesmarket sm
  on l.geom is not null and sm.geom is not null
 and ST_DWithin(l.geom::geography, sm.geom::geography, l.radius_miles * 1609.34)
group by l.location_id, sm.make, sm.model, sm.model_year, sm.segment;

-- Conquest flow: in-radius demand vs the store's own recent sales.
create or replace view core.v_conquest_flow as
select
  d.location_id, d.make, d.model, d.model_year,
  d.demand_units,
  coalesce(v.units_sold_90, 0) as units_sold_90,
  greatest(d.demand_units - coalesce(v.units_sold_90, 0), 0) as conquest_gap_units
from (
  select location_id, make, model, model_year, sum(demand_units) as demand_units
  from core.v_demand_radius
  group by location_id, make, model, model_year
) d
left join core.v_velocity v
  on v.location_id = d.location_id and v.make = d.make and v.model = d.model
 and coalesce(v.model_year, 0) = coalesce(d.model_year, 0);

-- Customer resolution (Rule 4) — fuzzy identity, all logic in one function.
create table if not exists core.entity_customer (
  customer_uid  uuid primary key default gen_random_uuid(),
  canonical_name text,
  city          text,
  state         text,
  name_norm     text not null,
  city_norm     text not null default '',
  state_norm    text not null default '',
  first_seen    date,
  last_seen     date,
  unique (name_norm, city_norm, state_norm)
);

create table if not exists core.customer_match (
  customer_uid uuid not null references core.entity_customer(customer_uid),
  source_type  text not null,        -- lead | deal | appointment
  source_id    text not null,
  location_id  text not null,
  match_score  numeric not null,
  match_method text not null,
  primary key (source_type, source_id, location_id)
);

create or replace function core.fn_normalize_name(p text)
returns text language sql immutable as $$
  select nullif(trim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g')), '')
$$;

-- Rebuilds entity_customer / customer_match from the latest lead/deal/appt
-- snapshots. v1 matches on normalized name + city + state (exact). To upgrade
-- to an exact CarStack id later, change ONLY this function body.
create or replace function core.fn_resolve_customers()
returns integer language plpgsql as $$
declare n integer;
begin
  create temporary table _src on commit drop as
  with leads as (
    select distinct on (location_id, lead_id)
      'lead'::text as source_type, lead_id as source_id, location_id,
      customer_name, city, state, created_hint as seen_date
    from raw.lead_snapshot
    order by location_id, lead_id, snapshot_date desc
  ),
  deals as (
    select distinct on (location_id, deal_id)
      'deal'::text, deal_id, location_id, customer_name, city, state, sold_date
    from raw.deal_snapshot
    order by location_id, deal_id, snapshot_date desc
  ),
  appts as (
    select distinct on (location_id, appointment_id)
      'appointment'::text, appointment_id, location_id, customer_name, city, state, appt_date
    from raw.appointment_snapshot
    order by location_id, appointment_id, snapshot_date desc
  ),
  u as (
    select * from leads union all select * from deals union all select * from appts
  )
  select
    source_type, source_id, location_id, customer_name, city, state, seen_date,
    core.fn_normalize_name(customer_name)            as name_norm,
    coalesce(core.fn_normalize_name(city), '')       as city_norm,
    coalesce(lower(trim(state)), '')                 as state_norm
  from u
  where core.fn_normalize_name(customer_name) is not null;

  insert into core.entity_customer
    (canonical_name, city, state, name_norm, city_norm, state_norm, first_seen, last_seen)
  select max(customer_name), max(city), max(state), name_norm, city_norm, state_norm,
         min(seen_date), max(seen_date)
  from _src
  group by name_norm, city_norm, state_norm
  on conflict (name_norm, city_norm, state_norm) do update set
    last_seen  = greatest(core.entity_customer.last_seen, excluded.last_seen),
    first_seen = least(core.entity_customer.first_seen, excluded.first_seen);

  insert into core.customer_match
    (customer_uid, source_type, source_id, location_id, match_score, match_method)
  select ec.customer_uid, s.source_type, s.source_id, s.location_id, 1.0,
         'name_city_state_exact'
  from _src s
  join core.entity_customer ec
    on ec.name_norm = s.name_norm
   and ec.city_norm = s.city_norm
   and ec.state_norm = s.state_norm
  on conflict (source_type, source_id, location_id) do update set
    customer_uid = excluded.customer_uid,
    match_score  = excluded.match_score,
    match_method = excluded.match_method;

  select count(*) into n from core.customer_match;
  return n;
end;
$$;

-- Lead → appointment → deal journey per resolved customer.
create or replace view core.v_customer_journey as
select
  ec.customer_uid, ec.canonical_name, ec.city, ec.state,
  count(*) filter (where cm.source_type = 'lead')        as lead_count,
  count(*) filter (where cm.source_type = 'appointment') as appointment_count,
  count(*) filter (where cm.source_type = 'deal')        as deal_count,
  min(cm.location_id)                                    as any_location
from core.entity_customer ec
join core.customer_match cm on cm.customer_uid = ec.customer_uid
group by ec.customer_uid, ec.canonical_name, ec.city, ec.state;

-- ---------------------------------------------------------------------------
-- ext.* — three external gaps (Rule 5). Agents fail soft until each is wired.
-- ---------------------------------------------------------------------------
create table if not exists ext.ga_vdp (
  snapshot_date date not null,
  location_id   text not null,
  vin           text not null,
  ga_sessions   int,
  vdp_views     int,
  primary key (snapshot_date, location_id, vin)
);

create table if not exists ext.gross_fi (
  location_id      text not null,
  deal_id          text not null,
  front_gross      numeric,
  back_gross       numeric,
  fi_product_count int,
  sold_date        date,
  primary key (location_id, deal_id)
);

create table if not exists ext.photos (
  snapshot_date date not null,
  location_id   text not null,
  vin           text not null,
  photo_count   int,
  has_360       boolean,
  primary key (snapshot_date, location_id, vin)
);

create table if not exists ext.feed_status (
  feed           text primary key,   -- ga_vdp | gross_fi | photos
  wired          boolean not null default false,
  last_loaded_at timestamptz,
  row_count_24h  int not null default 0
);

create or replace view ext.v_feed_readiness as
select feed, (wired and last_loaded_at is not null) as ready
from ext.feed_status;
