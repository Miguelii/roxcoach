-- Roxcoach lives in its own schema because the Supabase project is shared with another app.
-- Nothing is created in public. Rolling back Roxcoach means dropping this schema.
create schema if not exists roxcoach;

-- Applied migration files, kept apart from the other app's migration history.
create table roxcoach.schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
);

-- API access. anon gets nothing.
grant usage on schema roxcoach to authenticated, service_role;
grant select, insert, update, delete on all tables in schema roxcoach to authenticated;
grant all on all tables in schema roxcoach to service_role;

-- The application tables are created by later migrations, so "on all tables" above only reaches
-- the tables that exist now. Default privileges make every table that postgres (the role of the
-- Supabase SQL editor, which runs these migrations) creates later in this schema inherit the same
-- grants. 0006 revokes them again on the service-only tables.
alter default privileges for role postgres in schema roxcoach
    grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema roxcoach
    grant all on tables to service_role;

-- Only the migration runner writes the tracking table.
revoke insert, update, delete on roxcoach.schema_migrations from authenticated;

create type roxcoach.activity_source as enum ('strava', 'manual');
create type roxcoach.activity_category as enum ('run', 'hyrox', 'strength', 'cross', 'other');
create type roxcoach.session_kind as enum ('hyrox', 'run', 'strength', 'cross', 'rest');
create type roxcoach.race_type as enum ('hyrox', 'running', 'other');
create type roxcoach.race_priority as enum ('A', 'B', 'C');
create type roxcoach.race_status as enum ('upcoming', 'completed', 'cancelled');
create type roxcoach.hyrox_station as enum (
    'ski_erg',
    'sled_push',
    'sled_pull',
    'burpee_broad_jump',
    'rowing',
    'farmers_carry',
    'sandbag_lunges',
    'wall_balls'
);
create type roxcoach.report_status as enum ('generating', 'ready', 'failed');
create type roxcoach.planned_session_status as enum ('planned', 'done', 'skipped');
create type roxcoach.webhook_event_status as enum ('received', 'processed', 'ignored', 'failed');

-- Shared trigger function that keeps updated_at current on every edited row.
create function roxcoach.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

insert into roxcoach.schema_migrations (filename) values ('0001_schema_and_enums.sql');
