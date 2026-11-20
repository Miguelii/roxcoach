begin;

-- Strava sync was dropped: activities now come from manual upload. The enum value 'strava' of
-- activity_source stays (Postgres cannot drop an enum value), but nothing writes it.
drop table roxcoach.strava_webhook_events;
drop table roxcoach.strava_connections;
drop type roxcoach.webhook_event_status;

drop index roxcoach.activities_user_id_strava_id_key;
alter table roxcoach.activities drop column strava_id;

insert into roxcoach.schema_migrations (filename) values ('0007_remove_strava.sql');
commit;
