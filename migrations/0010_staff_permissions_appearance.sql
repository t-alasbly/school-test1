-- Per-staff capability flags and appearance (theme) JSON.

alter table staff
  add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table staff
  add column if not exists appearance jsonb not null default '{}'::jsonb;

alter table schools
  add column if not exists appearance jsonb not null default '{}'::jsonb;
