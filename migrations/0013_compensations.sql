-- Catalog of behavior-grade compensation opportunities.

create table if not exists compensation_options (
  id           serial primary key,
  school_id    integer not null references schools (id) on delete cascade,
  name         text not null,
  sort_order   integer not null default 0,
  active       boolean not null default true,
  unique (school_id, name)
);
create index if not exists compensation_options_school_idx on compensation_options (school_id, sort_order);
