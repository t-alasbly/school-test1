alter table students add column if not exists national_id text not null default '';
alter table students add column if not exists parent_phone_2 text not null default '';
alter table students add column if not exists work_phone text not null default '';
alter table students add column if not exists nationality text not null default '';
alter table students add column if not exists roster_order integer;
alter table students add column if not exists roster_status text not null default 'active';
alter table students add column if not exists roster_note text not null default '';
