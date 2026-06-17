-- Recommendation-type taxonomy: agent, owning role, and which ext feeds gate it.
insert into ref.recommendation_type (rec_type, agent, owner_role, default_enabled, requires_ext) values
  ('stocking_acquire',     'stocking',        'inventory_mgr', true, '{}'),
  ('pricing_markdown',     'pricing',         'used_car_mgr',  true, '{}'),
  ('aged_inventory',       'aged-inventory',  'used_car_mgr',  true, '{}'),
  ('lead_followup',        'lead-conversion', 'bdc_mgr',       true, '{}'),
  ('conquest_opportunity', 'conquest',        'new_car_mgr',   true, '{}'),
  ('photo_gap',            'photos',          'inventory_mgr', true, '{photos}'),
  ('gross_protection',     'gross-fi',        'finance_mgr',   true, '{gross_fi}'),
  ('vdp_engagement',       'ga-vdp',          'marketing_mgr', true, '{ga_vdp}')
on conflict (rec_type) do nothing;
