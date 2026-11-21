begin;

-- PostgreSQL cannot add an enum value inside a transaction. Same rebuild as 0010: keep existing
-- rows by going through text.
create type roxcoach.activity_source_with_zepp as enum ('strava', 'manual', 'lyfta', 'zepp');

alter table roxcoach.activities
    alter column source type text using source::text;

drop type roxcoach.activity_source;
alter type roxcoach.activity_source_with_zepp rename to activity_source;

alter table roxcoach.activities
    alter column source type roxcoach.activity_source using source::roxcoach.activity_source;

create table roxcoach.zepp_connections (
    user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
    encrypted_app_token text not null,
    last_synced_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on roxcoach.zepp_connections
    for each row execute function roxcoach.set_updated_at();

alter table roxcoach.zepp_connections enable row level security;
revoke all on roxcoach.zepp_connections from authenticated, anon;

insert into roxcoach.schema_migrations (filename) values ('0020_zepp.sql');
commit;
