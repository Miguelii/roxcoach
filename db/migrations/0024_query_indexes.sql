begin;

-- Serves the duplicate checks of uploads and Zepp imports and the "earlier workouts" read of the
-- activity page, which filter and sort on started_at.
create index activities_user_id_started_at_idx
    on roxcoach.activities (user_id, started_at);

-- The old index had no covering index for the foreign key to auth.users (every user delete
-- scanned the table) and did not start with user_id. The new one also serves the history read in
-- its exact order.
create index coach_messages_user_id_conversation_id_created_at_idx
    on roxcoach.coach_messages (user_id, conversation_id, created_at desc, id desc);
drop index roxcoach.coach_messages_conversation_id_created_at_idx;

-- public.logs is shared with another app. Build this index by hand first, without blocking writes
-- (see database.md), so this statement is then a no-op there.
create index if not exists logs_user_id_idx
    on public.logs (user_id)
    where user_id is not null;

insert into roxcoach.schema_migrations (filename) values ('0024_query_indexes.sql');
commit;
