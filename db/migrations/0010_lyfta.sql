begin;

-- PostgreSQL cannot add an enum value inside a transaction. Rebuild the type while preserving
-- existing rows, then restore the column to an enum before adding the Lyfta source.
create type roxcoach.activity_source_with_lyfta as enum ('strava', 'manual', 'lyfta');

alter table roxcoach.activities
    alter column source type text using source::text;

drop type roxcoach.activity_source;
alter type roxcoach.activity_source_with_lyfta rename to activity_source;

alter table roxcoach.activities
    alter column source type roxcoach.activity_source using source::roxcoach.activity_source;
alter table roxcoach.activities add column source_id text;

create unique index activities_user_id_source_source_id_key
    on roxcoach.activities (user_id, source, source_id);

create table roxcoach.lyfta_connections (
    user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
    encrypted_api_key text not null,
    last_synced_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on roxcoach.lyfta_connections
    for each row execute function roxcoach.set_updated_at();

alter table roxcoach.lyfta_connections enable row level security;
revoke all on roxcoach.lyfta_connections from authenticated, anon;

insert into roxcoach.schema_migrations (filename) values ('0010_lyfta.sql');
commit;
