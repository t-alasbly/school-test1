alter table behavior_types add column if not exists procedures jsonb not null default '[]'::jsonb;
alter table schools add column if not exists message_templates jsonb not null default '{}'::jsonb;
