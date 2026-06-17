-- Initialize the three external feeds as NOT wired (Rule 5: agents fail soft
-- until each is loaded). Flip `wired` and set last_loaded_at when a feed lands.
insert into ext.feed_status (feed, wired) values
  ('ga_vdp',   false),
  ('gross_fi', false),
  ('photos',   false)
on conflict (feed) do nothing;
