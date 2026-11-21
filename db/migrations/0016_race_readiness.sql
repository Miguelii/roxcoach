begin;

-- Time and distance per pace bin for one activity, built from the file's track points:
-- {"v": 1, "bins": [[pace_s_per_km, time_s, distance_m], ...]}. Null means not computed yet; an
-- empty bins array means computed and the file had no usable distance or speed. Used to find the
-- work faster than race pace in the race readiness card.
alter table roxcoach.activities
    add column pace_histogram jsonb;

comment on column roxcoach.activities.pace_histogram is
    'Pace histogram {v: 1, bins: [[pace_s_per_km, time_s, distance_m]]}; null = not computed.';

insert into roxcoach.schema_migrations (filename) values ('0016_race_readiness.sql');
commit;
