begin;

-- Daily coach message counter. The cap used to count coach_messages rows, so deleting a
-- conversation (messages cascade) gave the quota back, and parallel requests could all pass the
-- check before saving. The counter lives apart from the messages and is bumped atomically.
create table roxcoach.coach_usage (
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    -- The athlete's local calendar day, computed by the app from the athlete timezone.
    day date not null,
    message_count int not null default 0 check (message_count >= 0),
    primary key (user_id, day)
);

alter table roxcoach.coach_usage enable row level security;

-- Owners read, insert and update their own rows. There is no delete policy: a row is never
-- removed by a client, so the counter cannot be reset.
create policy select_own on roxcoach.coach_usage for select to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());
create policy insert_own on roxcoach.coach_usage for insert to authenticated
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy update_own on roxcoach.coach_usage for update to authenticated
    using (user_id = auth.uid() and roxcoach.has_access())
    with check (user_id = auth.uid() and roxcoach.has_access());

-- Takes one message slot for the caller on `p_day`: one atomic upsert that only counts while the
-- counter is below `p_cap`. Returns true when the slot was taken, false when the cap is reached.
-- Security invoker, so RLS applies and the row is always the caller's own (user_id defaults to
-- auth.uid()).
create function roxcoach.coach_take_message_slot(p_day date, p_cap int)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
    taken int;
begin
    insert into roxcoach.coach_usage as u (user_id, day, message_count)
    values (auth.uid(), p_day, 1)
    on conflict (user_id, day) do update
        set message_count = u.message_count + 1
        where u.message_count < p_cap
    returning u.message_count into taken;

    return taken is not null;
end;
$$;

revoke execute on function roxcoach.coach_take_message_slot(date, int) from public;
grant execute on function roxcoach.coach_take_message_slot(date, int) to authenticated, service_role;

-- Lease for the Lyfta sync: set while a sync runs so overlapping syncs of one athlete are refused.
-- The table stays service-only (0010 revoked client access).
alter table roxcoach.lyfta_connections add column sync_started_at timestamptz;

insert into roxcoach.schema_migrations (filename) values ('0014_coach_usage.sql');
commit;
