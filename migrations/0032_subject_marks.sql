create table if not exists student_subject_marks (
  school_id integer not null references schools (id) on delete cascade,
  staff_id text not null,
  student_id integer not null references students (id) on delete cascade,
  class_id integer not null references classes (id) on delete cascade,
  participation numeric not null default 0,
  exam numeric not null default 0,
  primary key (staff_id, student_id)
);
