create table if not exists staff_timetable (
  staff_id text not null,
  school_id integer not null references schools (id) on delete cascade,
  day smallint not null check (day between 0 and 4),
  period_key text not null,
  class_id integer references classes (id) on delete set null,
  place text not null default '',
  primary key (staff_id, day, period_key)
);
