-- Private correspondence on each note between teacher, student-affairs VP, and counselors.

alter table notes
  add column if not exists dest text not null default 'vp';

update notes set dest = 'counselor' where refer_counselor = true and dest = 'vp';

create table if not exists note_messages (
  id          serial primary key,
  school_id   integer not null references schools (id) on delete cascade,
  note_id     integer not null references notes (id) on delete cascade,
  author_id   text not null,
  to_kind     text not null default 'vp',
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists note_messages_note_idx on note_messages (note_id, created_at);
create index if not exists note_messages_school_idx on note_messages (school_id, created_at desc);
