begin;

create type roxcoach.run_type as enum ('long', 'fast');

alter table roxcoach.activities
    add column run_type roxcoach.run_type,
    add column run_type_manual boolean not null default false,
    add constraint activities_run_type_category_check
        check (category = 'run' or (run_type is null and run_type_manual = false));

-- The default run classification. Its twin in TypeScript is
-- src/_bff/modules/training/helpers/classify-run.helper.ts: keep both rules identical.
-- Time is the moving time, falling back to the elapsed time. Runs under 3000 m get no type.
create function roxcoach.classify_run_default(
    distance_m numeric,
    moving_time_s numeric,
    elapsed_time_s numeric
) returns roxcoach.run_type
language sql
immutable
set search_path = ''
as $$
    select case
        when distance_m is null or distance_m <= 0 or distance_m < 3000 then null
        when coalesce(moving_time_s, elapsed_time_s) is null
            or coalesce(moving_time_s, elapsed_time_s) <= 0 then null
        when distance_m > 6000 then 'long'::roxcoach.run_type
        when coalesce(moving_time_s, elapsed_time_s) / (distance_m / 1000.0) < 300
            then 'fast'::roxcoach.run_type
        else 'long'::roxcoach.run_type
    end
$$;

revoke all on function roxcoach.classify_run_default(numeric, numeric, numeric)
    from public, anon, authenticated;

update roxcoach.activities
    set run_type = roxcoach.classify_run_default(distance_m, moving_time_s, elapsed_time_s)
    where category = 'run' and deleted_at is null;

create table roxcoach.weekly_goals (
    user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
    weekly_run_distance_m int check (weekly_run_distance_m between 1000 and 500000),
    long_runs_per_week smallint check (long_runs_per_week between 1 and 7),
    fast_runs_per_week smallint check (fast_runs_per_week between 1 and 7),
    strength_sessions_per_week smallint check (strength_sessions_per_week between 1 and 14),
    short_run_max_m int not null default 3000,
    long_run_min_m int not null default 6000,
    fast_pace_s_per_km smallint not null default 300 check (fast_pace_s_per_km between 120 and 600),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (short_run_max_m > 0 and short_run_max_m < long_run_min_m and long_run_min_m <= 100000)
);

create trigger set_updated_at before update on roxcoach.weekly_goals
    for each row execute function roxcoach.set_updated_at();

alter table roxcoach.weekly_goals enable row level security;

-- No delete policy: the row goes with the user.
create policy select_own on roxcoach.weekly_goals for select to authenticated
    using ((user_id = (select auth.uid())) and (select roxcoach.has_access()));
create policy insert_own on roxcoach.weekly_goals for insert to authenticated
    with check ((user_id = (select auth.uid())) and (select roxcoach.has_access()));
create policy update_own on roxcoach.weekly_goals for update to authenticated
    using ((user_id = (select auth.uid())) and (select roxcoach.has_access()))
    with check ((user_id = (select auth.uid())) and (select roxcoach.has_access()));

insert into roxcoach.schema_migrations (filename) values ('0025_weekly_goals.sql');
commit;
