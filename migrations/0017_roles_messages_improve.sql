-- Extra school job titles, deactivate staff, custom WhatsApp templates,
-- and a catalog of behaviors a teacher can pick when starting an improvement plan.

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
    'pending'
  ));

alter table staff add column if not exists active boolean not null default true;

alter table schools add column if not exists custom_messages jsonb not null default '[]'::jsonb;

create table if not exists improvement_options (
  id           serial primary key,
  school_id    integer not null references schools (id) on delete cascade,
  name         text not null,
  sort_order   integer not null default 0,
  active       boolean not null default true,
  unique (school_id, name)
);
create index if not exists improvement_options_school_idx on improvement_options (school_id, sort_order);
