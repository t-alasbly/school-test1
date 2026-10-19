alter table daily_attendance drop constraint if exists daily_attendance_kind_check;
alter table daily_attendance drop constraint if exists daily_attendance_school_id_student_id_day_key;

update daily_attendance
set kind = 'leave'
where kind = 'late' and details like 'p7only:%';

insert into daily_attendance (school_id, student_id, day, kind, excused, details, recorded_by, arrived_at)
select a.school_id, a.student_id, a.day, 'leave', false, a.details, a.recorded_by, null
from daily_attendance a
where a.kind = 'late'
  and a.details like 'p7m:%'
  and not exists (
    select 1 from daily_attendance d
    where d.school_id = a.school_id and d.student_id = a.student_id and d.day = a.day and d.kind = 'leave'
  );

update daily_attendance
set details = ''
where kind = 'late' and details like 'p7%';

alter table daily_attendance
  add constraint daily_attendance_kind_check check (kind in ('absence', 'late', 'leave'));

create unique index if not exists daily_attendance_kind_day_idx
  on daily_attendance (school_id, student_id, day, kind);
