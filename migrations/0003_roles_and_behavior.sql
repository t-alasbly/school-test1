-- Expand staff roles and add a catalog of behavioral violation types.

alter table staff drop constraint if exists staff_role_check;
alter table staff add constraint staff_role_check
  check (role in ('admin', 'teacher', 'counselor', 'pending'));

create table if not exists behavior_types (
  id          serial primary key,
  school_id   integer not null references schools (id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  active      boolean not null default true
);
create index if not exists behavior_types_school_idx on behavior_types (school_id, sort_order);

alter table notes add column if not exists behavior_type_id integer references behavior_types (id) on delete set null;
