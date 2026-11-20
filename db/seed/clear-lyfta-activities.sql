-- Deletes every Lyfta-imported activity of ONE user and forgets the sync checkpoint, so the next
-- "Sync workouts" imports them again. The Lyfta connection (the saved key) is kept.
--
-- How to run it: replace <USER_ID> below (the user's auth.users id, a uuid), then run the whole
-- statement once in the Supabase SQL editor (default postgres role). It is a single statement, so
-- it either does everything or nothing, and it returns the counts.
--
-- What it removes: the user's activities with source = 'lyfta'. Their strength sets go with them
-- (on delete cascade). Effort or notes added by hand to those activities are lost. Activities from
-- other sources, races, profile, availability and coach conversations are not touched.
-- There is no undo: the data only comes back through a new sync from Lyfta.
with p as (
    select '<USER_ID>'::uuid as uid -- PLACEHOLDER: the only value to replace
),
deleted as (
    delete from roxcoach.activities a
    using p
    where a.user_id = p.uid and a.source = 'lyfta'
    returning a.id
),
reset as (
    update roxcoach.lyfta_connections c
    set last_synced_at = null
    from p
    where c.user_id = p.uid
    returning c.user_id
)
select
    (select count(*) from deleted) as deleted_activities,
    (select count(*) from reset) as connection_checkpoint_reset;
