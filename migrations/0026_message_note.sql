alter table parent_messages add column if not exists note_id integer;
create index if not exists parent_messages_note_idx on parent_messages (note_id);
