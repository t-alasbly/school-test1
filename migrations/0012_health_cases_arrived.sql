-- Arrival time for morning tardiness, health catalog, teacher-to-counselor cases.

alter table daily_attendance
  add column if not exists arrived_at timestamptz;

create table if not exists health_conditions (
  id           serial primary key,
  school_id    integer not null references schools (id) on delete cascade,
  name         text not null,
  sort_order   integer not null default 0,
  active       boolean not null default true,
  unique (school_id, name)
);
create index if not exists health_conditions_school_idx on health_conditions (school_id, sort_order);

create table if not exists counseling_cases (
  id           serial primary key,
  school_id    integer not null references schools (id) on delete cascade,
  student_id   integer not null references students (id) on delete cascade,
  author_id    text not null,
  kind         text not null check (kind in ('health', 'psych', 'learning')),
  body         text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists counseling_cases_school_idx on counseling_cases (school_id, created_at desc);
