begin;

-- Weekly goals (0025) replace the weekly availability.
drop table roxcoach.availability_slots;
drop type roxcoach.session_kind;

insert into roxcoach.schema_migrations (filename) values ('0026_remove_availability.sql');
commit;
