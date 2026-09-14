-- Season (summer/winter bell), period on notes, violation degree.

alter table schools add column if not exists season text not null default 'winter';

alter table notes add column if not exists period_key text not null default '';

alter table behavior_types add column if not exists degree integer not null default 1;
