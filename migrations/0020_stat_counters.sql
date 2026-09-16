alter table schools
  add column if not exists stat_counters jsonb not null default '[]'::jsonb;
