alter table schools
  add column if not exists invite_reasons jsonb not null default '[]'::jsonb;

create table if not exists roster_templates (
  id               serial primary key,
  school_id        integer not null references schools (id) on delete cascade,
  name             text not null,
  created_by       text not null,
  created_by_name  text not null,
  is_program       boolean not null default false,
  payload          jsonb not null,
  created_at       timestamptz not null default now()
);
create index if not exists roster_templates_school_idx
  on roster_templates (school_id, is_program desc, created_at desc);
