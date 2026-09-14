-- Teacher visibility / parent-message permissions, logged WhatsApp, behavior improvement.

alter table schools
  add column if not exists teachers_can_message boolean not null default true;
alter table schools
  add column if not exists teachers_can_view_all boolean not null default false;

create table if not exists parent_messages (
  id            serial primary key,
  school_id     integer not null references schools (id) on delete cascade,
  student_id    integer not null references students (id) on delete cascade,
  staff_id      text not null,
  kind          text not null default 'general',
  body          text not null,
  parent_phone  text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists parent_messages_school_idx
  on parent_messages (school_id, created_at desc);
create index if not exists parent_messages_student_idx
  on parent_messages (student_id);

create table if not exists behavior_improvements (
  id                 serial primary key,
  school_id          integer not null references schools (id) on delete cascade,
  student_id         integer not null references students (id) on delete cascade,
  teacher_id         text not null,
  note_id            integer references notes (id) on delete set null,
  plan               text not null,
  teacher_followup   text not null default '',
  counselor_note     text not null default '',
  status             text not null default 'open'
                     check (status in ('open', 'following', 'closed')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  closed_at          timestamptz,
  closed_by          text
);
create index if not exists improvements_school_idx
  on behavior_improvements (school_id, status, created_at desc);
create index if not exists improvements_student_idx
  on behavior_improvements (student_id);
