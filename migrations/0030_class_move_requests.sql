create table if not exists class_move_requests (
  id serial primary key,
  school_id integer not null,
  student_id integer not null,
  from_class_id integer,
  to_class_id integer not null,
  requested_by text not null,
  status text not null default 'pending',
  decision_note text not null default '',
  decided_by text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists class_move_requests_school_idx on class_move_requests (school_id, status, created_at desc);
