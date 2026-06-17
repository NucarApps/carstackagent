-- Reference makes/models (no trim — Rule 3).
insert into ref.make (make) values
  ('Toyota'), ('Honda'), ('Ford'), ('Chevrolet'), ('Subaru'), ('Nissan')
on conflict (make) do nothing;

insert into ref.model (make, model) values
  ('Toyota','RAV4'), ('Toyota','Camry'), ('Toyota','Tacoma'),
  ('Honda','CR-V'), ('Honda','Civic'), ('Honda','Accord'),
  ('Ford','F-150'), ('Ford','Explorer'),
  ('Chevrolet','Silverado'), ('Chevrolet','Equinox'),
  ('Subaru','Outback'), ('Subaru','Forester'),
  ('Nissan','Rogue'), ('Nissan','Altima')
on conflict (make, model) do nothing;
