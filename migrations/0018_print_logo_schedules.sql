alter table schools add column if not exists print_school_logo boolean not null default false;
alter table schools add column if not exists schedules jsonb not null default '{}'::jsonb;
