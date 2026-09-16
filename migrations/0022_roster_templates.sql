create table if not exists roster_templates (
  id serial primary key,
  school_id integer not null,
  owner_id text not null default '',
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
