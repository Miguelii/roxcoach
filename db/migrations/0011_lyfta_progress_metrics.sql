begin;

alter table roxcoach.activities
    add column body_weight_kg numeric,
    add column lyfta_total_volume_kg_reps numeric;

alter table roxcoach.strength_sets
    add column source_exercise_id text,
    add column rir smallint check (rir >= 0);

create index strength_sets_user_id_source_exercise_id_idx
    on roxcoach.strength_sets (user_id, source_exercise_id)
    where source_exercise_id is not null;

update roxcoach.lyfta_connections set last_synced_at = null where last_synced_at is not null;

comment on column roxcoach.activities.body_weight_kg is
    'Lyfta workout body weight normalized to kilograms.';
comment on column roxcoach.activities.lyfta_total_volume_kg_reps is
    'Lyfta total volume normalized to kilograms times repetitions.';
comment on column roxcoach.strength_sets.source_exercise_id is
    'Stable exercise identifier from the workout source, when available.';

insert into roxcoach.schema_migrations (filename) values ('0011_lyfta_progress_metrics.sql');
commit;
