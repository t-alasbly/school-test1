-- Action catalog, teacher subject/phone, and school principal name.

alter table schools add column if not exists principal_name text not null default '';

alter table staff add column if not exists subject text not null default '';
alter table staff add column if not exists phone text not null default '';

create table if not exists action_types (
  id          serial primary key,
  school_id   integer not null references schools (id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  active      boolean not null default true
);
create index if not exists action_types_school_idx on action_types (school_id, sort_order);
