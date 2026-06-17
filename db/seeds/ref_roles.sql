-- Roles (owner_role) and feedback actions.
insert into ref.role (owner_role, display_name, description, sort_order) values
  ('gm',           'General Manager',   'Sees every recommendation', 10),
  ('used_car_mgr', 'Used Car Manager',  null, 20),
  ('new_car_mgr',  'New Car Manager',   null, 30),
  ('sales_mgr',    'Sales Manager',     null, 40),
  ('bdc_mgr',      'BDC Manager',       null, 50),
  ('inventory_mgr','Inventory Manager', null, 60),
  ('finance_mgr',  'Finance Manager',   null, 70),
  ('marketing_mgr','Marketing Manager', null, 80)
on conflict (owner_role) do nothing;

insert into ref.feedback_action (action) values ('accept'), ('dismiss'), ('snooze')
on conflict (action) do nothing;
