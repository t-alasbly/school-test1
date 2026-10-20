alter table eval_scales
  add column if not exists plan text not null default '{}';

alter table eval_cards
  add column if not exists column_id text not null default '';
alter table eval_cards
  add column if not exists column_ref text not null default '';

alter table student_evals
  add column if not exists period_no integer not null default 1;
alter table student_evals
  add column if not exists lesson_key text not null default '';
alter table student_evals
  add column if not exists column_id text not null default '';
alter table student_evals
  add column if not exists entered_by text not null default '';

create table if not exists student_period_marks (
  school_id integer not null references schools (id) on delete cascade,
  staff_id text not null,
  student_id integer not null references students (id) on delete cascade,
  class_id integer not null references classes (id) on delete cascade,
  period_no integer not null,
  participation numeric not null default 0,
  exam numeric not null default 0,
  subject text not null default '',
  extras jsonb not null default '{}'::jsonb
);

alter table student_period_marks
  add column if not exists subject text not null default '';
alter table student_period_marks
  add column if not exists extras jsonb not null default '{}'::jsonb;

create unique index if not exists student_period_marks_unique_idx
  on student_period_marks (staff_id, student_id, period_no, subject);
