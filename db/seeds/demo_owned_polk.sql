-- DEMO-ONLY rows for the OWNED Polk table (public.sales_market_salesmarket),
-- placed within the demo stores' PMA radius so the PostGIS demand/conquest views
-- return data locally. In a real deployment this table is owned by an existing
-- pipeline and this seed is NOT run. Idempotent via delete-then-insert of the
-- demo id range.
delete from public.sales_market_salesmarket where id between 9001 and 9010;
insert into public.sales_market_salesmarket (id, geom, make, model, model_year, segment, units, period) values
  (9001, ST_SetSRID(ST_MakePoint(-75.55, 39.74), 4326), 'Toyota', 'RAV4',    2022, 'Compact SUV',       180, current_date),
  (9002, ST_SetSRID(ST_MakePoint(-75.56, 39.70), 4326), 'Honda',  'CR-V',    2022, 'Compact SUV',       150, current_date),
  (9003, ST_SetSRID(ST_MakePoint(-75.60, 39.68), 4326), 'Ford',   'F-150',   2021, 'Full-size Pickup',  210, current_date),
  (9004, ST_SetSRID(ST_MakePoint(-75.50, 39.72), 4326), 'Subaru', 'Outback', 2022, 'Midsize SUV',        90, current_date),
  (9005, ST_SetSRID(ST_MakePoint(-75.58, 39.66), 4326), 'Toyota', 'Tacoma',  2022, 'Midsize Pickup',    110, current_date),
  (9006, ST_SetSRID(ST_MakePoint(-75.54, 39.69), 4326), 'Honda',  'Civic',   2022, 'Compact Car',        75, current_date);
