-- Drop a leftover one-row-per-day unique so late and leave can share a day.
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where t.relname = 'daily_attendance'
      and n.nspname = current_schema()
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) not ilike '%kind%'
  loop
    execute format('alter table daily_attendance drop constraint %I', r.conname);
  end loop;
end $$;

alter table daily_attendance drop constraint if exists daily_attendance_kind_check;
alter table daily_attendance
  add constraint daily_attendance_kind_check check (kind in ('absence', 'late', 'leave'));

create unique index if not exists daily_attendance_kind_day_idx
  on daily_attendance (school_id, student_id, day, kind);
