begin;

alter table roxcoach.strength_sets
    add column exercise_image_url text;

update roxcoach.lyfta_connections set last_synced_at = null where last_synced_at is not null;

comment on column roxcoach.strength_sets.exercise_image_url is
    'Optional Lyfta exercise image URL; NULL for manual sets or exercises without an image.';

insert into roxcoach.schema_migrations (filename) values ('0013_strength_exercise_images.sql');
commit;
