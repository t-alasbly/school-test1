-- Extra operational job titles on staff.

alter table staff drop constraint if exists staff_role_check;
alter table staff add constraint staff_role_check
  check (role in (
    'admin',
    'principal',
    'school_vp',
    'teachers_vp',
    'counselor',
    'student_counselor',
    'health_counselor',
    'activity_leader',
    'teacher',
    'security',
    'admin_assistant',
    'admin_staff',
    'pending'
  ));
