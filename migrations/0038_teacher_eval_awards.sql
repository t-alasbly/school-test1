alter table eval_cards
  add column if not exists is_award boolean not null default false;

alter table student_evals
  add column if not exists is_award boolean not null default false;
