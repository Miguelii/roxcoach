begin;

-- Lyfta flags the set that broke a personal record (1RM, set volume) in the workout payload. The
-- flags are stored as a json array of { type, level, value } so the activity page can show the
-- same records the athlete sees in Lyfta, including records older than the data kept here.
alter table roxcoach.strength_sets
    add column lyfta_records jsonb
        check (lyfta_records is null or jsonb_typeof(lyfta_records) = 'array');

comment on column roxcoach.strength_sets.lyfta_records is
    'Records Lyfta flagged on this set, [{type, level, value}]; NULL when none or not from Lyfta.';

-- Existing imports have no records yet: the next manual sync refetches the last 360 days.
update roxcoach.lyfta_connections set last_synced_at = null where last_synced_at is not null;

insert into roxcoach.schema_migrations (filename) values ('0019_strength_set_lyfta_records.sql');
commit;
