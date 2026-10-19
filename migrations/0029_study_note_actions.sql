alter table notes add column if not exists study_note_id integer;
create index if not exists notes_study_note_idx on notes (school_id, student_id, study_note_id);
