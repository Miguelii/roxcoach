-- Row Level Security for every Roxcoach table. The Supabase project is shared with another app, so
-- being signed in is not enough: every policy also requires the explicit Roxcoach access flag.

-- True only when the JWT carries app_metadata.roxcoach as the JSON boolean true. Only the service
-- role can write app_metadata, so a user of the other app cannot grant it to themselves.
--
-- The flag is compared as jsonb, not cast with ->> and ::boolean: that cast also accepts the
-- strings "true", "t", "yes", "on" and "1", and raises an error (failing the whole query) for any
-- other string. The access rule is a strict boolean true.
--
-- security invoker (the default): the function only reads the caller's own request claims through
-- auth.jwt(), so it needs no privilege beyond the caller's. security definer would run it as the
-- owner for no benefit and widen what a future edit could expose.
--
-- search_path = '': every name is schema-qualified, so a caller cannot shadow auth.jwt() or an
-- operator by putting their own schema first. Built-in operators and types still resolve because
-- pg_catalog is always searched.
create function roxcoach.has_access()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
    select coalesce(auth.jwt() -> 'app_metadata' -> 'roxcoach' = 'true'::jsonb, false)
$$;

-- Policies run with the caller's privileges, so authenticated must be able to execute it. Nobody
-- else needs it.
revoke execute on function roxcoach.has_access() from public;
grant execute on function roxcoach.has_access() to authenticated, service_role;

-- RLS on every table, including the service-only ones and the migration log.
--
-- Not "force row level security": force only affects the table owner (postgres), which is the
-- migration and SQL editor role. It must keep writing schema_migrations and running the one-time
-- seed (athlete_profiles insert, where auth.uid() is null), and on delete cascade from auth.users
-- must keep working. App clients never connect as the owner, and service_role bypasses RLS through
-- its BYPASSRLS attribute whether or not RLS is forced.
alter table roxcoach.schema_migrations enable row level security;
alter table roxcoach.athlete_profiles enable row level security;
alter table roxcoach.availability_slots enable row level security;
alter table roxcoach.races enable row level security;
alter table roxcoach.strava_connections enable row level security;
alter table roxcoach.strava_webhook_events enable row level security;
alter table roxcoach.activities enable row level security;
alter table roxcoach.activity_laps enable row level security;
alter table roxcoach.station_results enable row level security;
alter table roxcoach.strength_sets enable row level security;
alter table roxcoach.weekly_reports enable row level security;
alter table roxcoach.planned_sessions enable row level security;

-- Service-only tables: RLS on, no policies, and no table privileges for client roles. RLS alone
-- already returns nothing, but without the grant a policy added here by mistake still cannot expose
-- Strava tokens or webhook payloads to a client session.
revoke all on roxcoach.strava_connections from authenticated, anon;
revoke all on roxcoach.strava_webhook_events from authenticated, anon;
revoke all on roxcoach.schema_migrations from authenticated, anon;

-- Client tables: one policy per operation, all the same owner check. Every table, children
-- included, carries user_id, so no policy needs a join. Composite foreign keys stop a child from
-- pointing at another user's parent even when the policy passes.

create policy select_own on roxcoach.athlete_profiles for select to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());
create policy insert_own on roxcoach.athlete_profiles for insert to authenticated
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy update_own on roxcoach.athlete_profiles for update to authenticated
    using (user_id = auth.uid() and roxcoach.has_access())
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy delete_own on roxcoach.athlete_profiles for delete to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());

create policy select_own on roxcoach.availability_slots for select to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());
create policy insert_own on roxcoach.availability_slots for insert to authenticated
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy update_own on roxcoach.availability_slots for update to authenticated
    using (user_id = auth.uid() and roxcoach.has_access())
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy delete_own on roxcoach.availability_slots for delete to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());

create policy select_own on roxcoach.races for select to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());
create policy insert_own on roxcoach.races for insert to authenticated
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy update_own on roxcoach.races for update to authenticated
    using (user_id = auth.uid() and roxcoach.has_access())
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy delete_own on roxcoach.races for delete to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());

create policy select_own on roxcoach.activities for select to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());
create policy insert_own on roxcoach.activities for insert to authenticated
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy update_own on roxcoach.activities for update to authenticated
    using (user_id = auth.uid() and roxcoach.has_access())
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy delete_own on roxcoach.activities for delete to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());

create policy select_own on roxcoach.activity_laps for select to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());
create policy insert_own on roxcoach.activity_laps for insert to authenticated
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy update_own on roxcoach.activity_laps for update to authenticated
    using (user_id = auth.uid() and roxcoach.has_access())
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy delete_own on roxcoach.activity_laps for delete to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());

create policy select_own on roxcoach.station_results for select to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());
create policy insert_own on roxcoach.station_results for insert to authenticated
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy update_own on roxcoach.station_results for update to authenticated
    using (user_id = auth.uid() and roxcoach.has_access())
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy delete_own on roxcoach.station_results for delete to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());

create policy select_own on roxcoach.strength_sets for select to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());
create policy insert_own on roxcoach.strength_sets for insert to authenticated
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy update_own on roxcoach.strength_sets for update to authenticated
    using (user_id = auth.uid() and roxcoach.has_access())
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy delete_own on roxcoach.strength_sets for delete to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());

create policy select_own on roxcoach.weekly_reports for select to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());
create policy insert_own on roxcoach.weekly_reports for insert to authenticated
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy update_own on roxcoach.weekly_reports for update to authenticated
    using (user_id = auth.uid() and roxcoach.has_access())
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy delete_own on roxcoach.weekly_reports for delete to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());

create policy select_own on roxcoach.planned_sessions for select to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());
create policy insert_own on roxcoach.planned_sessions for insert to authenticated
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy update_own on roxcoach.planned_sessions for update to authenticated
    using (user_id = auth.uid() and roxcoach.has_access())
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy delete_own on roxcoach.planned_sessions for delete to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());

insert into roxcoach.schema_migrations (filename) values ('0006_rls.sql');
