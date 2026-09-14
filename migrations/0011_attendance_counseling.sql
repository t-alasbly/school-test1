-- Daily full-day attendance, counseling referrals, health notes, violation time.

alter table students
  add column if not exists health_note text not null default '';

alter table notes
  add column if not exists occurred_at timestamptz;
update notes set occurred_at = created_at where occurred_at is null;
alter table notes
  alter column occurred_at set default now();
alter table notes
  alter column occurred_at set not null;

alter table notes
  add column if not exists refer_counselor boolean not null default false;
alter table notes
  add column if not exists suggested_action text not null default '';
alter table notes
  add column if not exists compensation text not null default '';

create table if not exists daily_attendance (
  id           serial primary key,
  school_id    integer not null references schools (id) on delete cascade,
  student_id   integer not null references students (id) on delete cascade,
  day          date not null,
  kind         text not null check (kind in ('absence', 'late')),
  excused      boolean not null default false,
  details      text not null default '',
  recorded_by  text not null,
  created_at   timestamptz not null default now(),
  unique (school_id, student_id, day)
);
create index if not exists daily_attendance_day_idx on daily_attendance (school_id, day);
create index if not exists notes_refer_idx on notes (school_id, refer_counselor) where refer_counselor = true;
