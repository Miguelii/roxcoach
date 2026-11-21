begin;

-- The Lyfta import now keeps sets that have reps or weight even when Lyfta does not mark them
-- completed. Workouts imported before this change were saved without those sets. Clearing every
-- sync checkpoint makes each athlete's next manual sync re-read the last 360 days and rebuild the
-- sets of the workouts already imported. No activity or note is deleted.
update roxcoach.lyfta_connections set last_synced_at = null where last_synced_at is not null;

insert into roxcoach.schema_migrations (filename) values ('0018_lyfta_resync_incomplete_sets.sql');
commit;
