-- School follow-up app schema. All tenant rows hang off school_id;
-- staff.user_id is the Better Auth user id (TEXT).

create table if not exists schools (
  id          serial primary key,
  name        text not null,
  created_by  text not null,
  created_at  timestamptz not null default now()
);

create table if not exists staff (
  user_id       text primary key,
  school_id     integer not null references schools (id) on delete cascade,
  display_name  text not null,
  role          text not null check (role in ('admin', 'teacher', 'pending')),
  created_at    timestamptz not null default now()
);
create index if not exists staff_school_id_idx on staff (school_id);

create table if not exists stages (
  id          serial primary key,
  school_id   integer not null references schools (id) on delete cascade,
  name        text not null,
  short_name  text not null,
  sort_order  integer not null default 0
);
create index if not exists stages_school_id_idx on stages (school_id);

create table if not exists classes (
  id          serial primary key,
  school_id   integer not null references schools (id) on delete cascade,
  stage_id    integer not null references stages (id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0
);
create index if not exists classes_stage_id_idx on classes (stage_id);
create index if not exists classes_school_id_idx on classes (school_id);

create table if not exists students (
  id            serial primary key,
  school_id     integer not null references schools (id) on delete cascade,
  class_id      integer not null references classes (id) on delete cascade,
  name          text not null,
  parent_phone  text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists students_class_id_idx on students (class_id);
create index if not exists students_school_id_idx on students (school_id);
create index if not exists students_name_idx on students (school_id, name);

create table if not exists notes (
  id           serial primary key,
  school_id    integer not null references schools (id) on delete cascade,
  student_id   integer not null references students (id) on delete cascade,
  teacher_id   text not null,
  type         text not null check (type in ('absence', 'late', 'homework', 'behavior')),
  details      text not null default '',
  status       text not null default 'open' check (status in ('open', 'closed')),
  action_taken text not null default '',
  created_at   timestamptz not null default now(),
  closed_at    timestamptz,
  closed_by    text
);
create index if not exists notes_school_id_idx on notes (school_id, created_at desc);
create index if not exists notes_student_id_idx on notes (student_id);
create index if not exists notes_status_idx on notes (school_id, status);

create table if not exists notifications (
  id          serial primary key,
  school_id   integer not null references schools (id) on delete cascade,
  user_id     text not null,
  note_id     integer references notes (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text not null,
  tone        text not null default 'amber',
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, read, created_at desc);
