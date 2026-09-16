alter table schools
  add column if not exists stat_hidden jsonb not null default '[]'::jsonb;
