begin;

alter table roxcoach.strength_sets
    add column exercise_index int check (exercise_index >= 1);

create index strength_sets_user_id_activity_id_exercise_index_set_index_idx
    on roxcoach.strength_sets (user_id, activity_id, exercise_index, set_index);

update roxcoach.lyfta_connections set last_synced_at = null where last_synced_at is not null;

comment on column roxcoach.strength_sets.exercise_index is
    'Original exercise order within the activity; NULL for legacy rows with unknown order.';

insert into roxcoach.schema_migrations (filename) values ('0012_strength_exercise_order.sql');
commit;
