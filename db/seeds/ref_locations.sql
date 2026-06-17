-- Demo rooftops with geometry + PMA radius (used by the PostGIS demand views).
insert into ref.location (location_id, store_name, rooftop_code, geom, radius_miles, pma_zip, active) values
  ('NUCAR-01', 'Nucar Wilmington', 'WILM',
     ST_SetSRID(ST_MakePoint(-75.5466, 39.7459), 4326), 25, '19801', true),
  ('NUCAR-02', 'Nucar New Castle', 'NCAS',
     ST_SetSRID(ST_MakePoint(-75.5666, 39.6620), 4326), 25, '19720', true)
on conflict (location_id) do nothing;
