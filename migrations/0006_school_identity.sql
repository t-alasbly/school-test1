-- School identity for official forms: region, office, gendered titles, counselor names.

alter table schools add column if not exists region text not null default '';
alter table schools add column if not exists governorate text not null default '';
alter table schools add column if not exists leadership_gender text not null default 'male';
alter table schools add column if not exists student_gender text not null default 'male';
alter table schools add column if not exists counselor_name text not null default '';
alter table schools add column if not exists technical_vp_name text not null default '';
