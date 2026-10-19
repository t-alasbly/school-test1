alter table students add column if not exists national_id text not null default '';
alter table students add column if not exists parent_phone_2 text not null default '';
alter table students add column if not exists nationality text not null default '';
create unique index if not exists students_national_id_idx
  on students (school_id, national_id)
  where national_id <> '';

create table if not exists teacher_class_pins (
  staff_id  text not null,
  class_id  integer not null references classes (id) on delete cascade,
  school_id integer not null references schools (id) on delete cascade,
  primary key (staff_id, class_id)
);

create table if not exists eval_scales (
  staff_id    text primary key,
  school_id   integer not null references schools (id) on delete cascade,
  tasks_max   numeric not null default 40,
  quizzes_max numeric not null default 20
);

create table if not exists eval_cards (
  id         serial primary key,
  school_id  integer not null references schools (id) on delete cascade,
  staff_id   text not null,
  label      text not null,
  points     numeric not null,
  bucket     text not null check (bucket in ('tasks', 'quizzes')),
  enabled    boolean not null default true,
  sort_order integer not null default 0
);
create index if not exists eval_cards_staff_idx on eval_cards (school_id, staff_id);

create table if not exists student_evals (
  id         serial primary key,
  school_id  integer not null references schools (id) on delete cascade,
  staff_id   text not null,
  student_id integer not null references students (id) on delete cascade,
  class_id   integer not null references classes (id) on delete cascade,
  card_id    integer references eval_cards (id) on delete set null,
  label      text not null,
  points     numeric not null,
  bucket     text not null,
  subject    text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists student_evals_class_idx on student_evals (school_id, staff_id, class_id);
