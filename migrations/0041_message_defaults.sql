alter table schools add column if not exists message_defaults jsonb not null default '{"sameRepeat":true,"otherViolations":false,"late":false,"absence":false}'::jsonb;
