begin;

-- Wraps auth.uid() and roxcoach.has_access() in a scalar subselect so Postgres evaluates each once
-- per statement as an InitPlan instead of once per scanned row (Supabase lint auth_rls_initplan).
-- The meaning of every policy is unchanged. alter policy takes an access exclusive lock per table.
set local lock_timeout = '5s';

alter policy delete_own on roxcoach.activities
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy insert_own on roxcoach.activities
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy select_own on roxcoach.activities
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy update_own on roxcoach.activities
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()))
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy delete_own on roxcoach.activity_files
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy insert_own on roxcoach.activity_files
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy select_own on roxcoach.activity_files
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy update_own on roxcoach.activity_files
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()))
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy delete_own on roxcoach.activity_laps
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy insert_own on roxcoach.activity_laps
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy select_own on roxcoach.activity_laps
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy update_own on roxcoach.activity_laps
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()))
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy delete_own on roxcoach.athlete_profiles
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy insert_own on roxcoach.athlete_profiles
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy select_own on roxcoach.athlete_profiles
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy update_own on roxcoach.athlete_profiles
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()))
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy delete_own on roxcoach.availability_slots
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy insert_own on roxcoach.availability_slots
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy select_own on roxcoach.availability_slots
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy update_own on roxcoach.availability_slots
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()))
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy delete_own on roxcoach.coach_conversations
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy insert_own on roxcoach.coach_conversations
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy select_own on roxcoach.coach_conversations
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy update_own on roxcoach.coach_conversations
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()))
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy delete_own on roxcoach.coach_messages
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy insert_own on roxcoach.coach_messages
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy select_own on roxcoach.coach_messages
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy update_own on roxcoach.coach_messages
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()))
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy insert_own on roxcoach.coach_usage
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy select_own on roxcoach.coach_usage
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy update_own on roxcoach.coach_usage
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()))
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy delete_own on roxcoach.races
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy insert_own on roxcoach.races
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy select_own on roxcoach.races
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy update_own on roxcoach.races
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()))
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy delete_own on roxcoach.station_results
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy insert_own on roxcoach.station_results
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy select_own on roxcoach.station_results
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy update_own on roxcoach.station_results
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()))
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy delete_own on roxcoach.strength_sets
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy insert_own on roxcoach.strength_sets
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy select_own on roxcoach.strength_sets
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy update_own on roxcoach.strength_sets
    using ((user_id = (select auth.uid())) AND (select roxcoach.has_access()))
    with check ((user_id = (select auth.uid())) AND (select roxcoach.has_access()));

alter policy activity_files_delete_own on storage.objects
    using ((bucket_id = 'activity-files'::text) AND ((storage.foldername(name))[1] = (select auth.uid()::text)) AND (select roxcoach.has_access()));

alter policy activity_files_insert_own on storage.objects
    with check ((bucket_id = 'activity-files'::text) AND ((storage.foldername(name))[1] = (select auth.uid()::text)) AND (select roxcoach.has_access()));

alter policy activity_files_select_own on storage.objects
    using ((bucket_id = 'activity-files'::text) AND ((storage.foldername(name))[1] = (select auth.uid()::text)) AND (select roxcoach.has_access()));

insert into roxcoach.schema_migrations (filename) values ('0023_rls_initplan.sql');
commit;
