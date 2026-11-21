begin;

-- Which charts the dashboard shows: running or strength. Saved per athlete.
alter table roxcoach.athlete_profiles
    add column dashboard_mode text not null default 'run'
        check (dashboard_mode in ('run', 'strength'));

-- Time and distance per heart rate for one activity, built from the file's track points:
-- {"v": 1, "bins": [[bpm, time_s, distance_m], ...]}. Null means not computed yet; an empty
-- bins array means computed and the file had no usable heart rate. Zones are derived at read
-- time from the athlete's current max and resting heart rate.
alter table roxcoach.activities
    add column hr_histogram jsonb;

comment on column roxcoach.athlete_profiles.dashboard_mode is
    'Dashboard mode: run or strength.';
comment on column roxcoach.activities.hr_histogram is
    'HR histogram {v: 1, bins: [[bpm, time_s, distance_m]]}; null = not computed.';

insert into roxcoach.schema_migrations (filename) values ('0015_dashboard_progress.sql');
commit;
