-- Sensitive: only the service-role client reads or writes this table.
create table roxcoach.strava_connections (
    user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
    strava_athlete_id bigint not null unique,
    access_token text not null,
    refresh_token text not null,
    expires_at timestamptz not null,
    scope text not null,
    connected_at timestamptz not null default now(),
    last_synced_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on roxcoach.strava_connections
    for each row execute function roxcoach.set_updated_at();

-- Webhook idempotency and audit. user_id is nullable: the owner may match no connection.
create table roxcoach.strava_webhook_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid default auth.uid() references auth.users (id) on delete cascade,
    object_type text not null check (object_type in ('activity', 'athlete')),
    object_id bigint not null,
    aspect_type text not null check (aspect_type in ('create', 'update', 'delete')),
    owner_id bigint not null,
    event_time timestamptz not null,
    status roxcoach.webhook_event_status not null,
    error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id, object_type, object_id, aspect_type, event_time)
);

create index strava_webhook_events_user_id_event_time_idx
    on roxcoach.strava_webhook_events (user_id, event_time desc);

create trigger set_updated_at before update on roxcoach.strava_webhook_events
    for each row execute function roxcoach.set_updated_at();

insert into roxcoach.schema_migrations (filename) values ('0003_strava.sql');
