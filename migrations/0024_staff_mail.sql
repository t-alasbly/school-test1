-- Internal staff correspondence about a student, with reply thread and forwarding.

create table if not exists student_mail (
  id           serial primary key,
  school_id    integer not null references schools (id) on delete cascade,
  student_id   integer not null references students (id) on delete cascade,
  author_id    text not null,
  assignee_id  text not null,
  dest         text not null default 'vp',
  status       text not null default 'open',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists student_mail_school_idx on student_mail (school_id, updated_at desc);
create index if not exists student_mail_student_idx on student_mail (student_id, updated_at desc);
create index if not exists student_mail_assignee_idx on student_mail (assignee_id, updated_at desc);

create table if not exists student_mail_msg (
  id          serial primary key,
  school_id   integer not null references schools (id) on delete cascade,
  mail_id     integer not null references student_mail (id) on delete cascade,
  author_id   text not null,
  kind        text not null default 'message',
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists student_mail_msg_mail_idx on student_mail_msg (mail_id, created_at);
