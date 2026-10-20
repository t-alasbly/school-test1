alter table student_evals
  add column if not exists lesson_key text not null default '';
