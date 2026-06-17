-- Default SQL thresholds the agents read (global scope: role/location/rec_type
-- all null). The weekly learning loop nudges these per most-specific scope.
insert into rec.manager_calibration (scope_role, location_id, rec_type, param_key, param_value, source) values
  (null, null, 'aged_inventory',       'aged_days',           60,  'default'),
  (null, null, 'pricing_markdown',     'aged_days',           45,  'default'),
  (null, null, 'pricing_markdown',     'min_markdown',        0,   'default'),
  (null, null, 'stocking_acquire',     'demand_supply_ratio', 1.5, 'default'),
  (null, null, 'conquest_opportunity', 'min_conquest_gap',    10,  'default'),
  (null, null, 'lead_followup',        'stale_days',          3,   'default')
on conflict (scope_key, param_key) do nothing;
