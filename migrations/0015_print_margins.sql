alter table schools add column if not exists print_margins jsonb not null default '{"top":10,"right":10,"bottom":12,"left":8}'::jsonb;
