alter table schools
  add column if not exists role_labels jsonb not null default '{}'::jsonb;
