begin;

create type roxcoach.sync_status as enum ('idle', 'running', 'succeeded', 'failed');

alter table roxcoach.lyfta_connections
    add column sync_status roxcoach.sync_status not null default 'idle',
    add column sync_finished_at timestamptz,
    add column sync_run_id text,
    add column sync_result jsonb,
    add column sync_error text;

alter table roxcoach.zepp_connections
    add column sync_status roxcoach.sync_status not null default 'idle',
    add column sync_started_at timestamptz,
    add column sync_finished_at timestamptz,
    add column sync_run_id text,
    add column sync_result jsonb,
    add column sync_error text;

-- The old 5 minute lease is replaced by sync_status, so a leftover lease means nothing now.
update roxcoach.lyfta_connections set sync_started_at = null;

insert into roxcoach.schema_migrations (filename) values ('0021_background_sync.sql');
commit;
