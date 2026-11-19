create table roxcoach.activities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    source roxcoach.activity_source not null,
    strava_id bigint,
    category roxcoach.activity_category not null,
    sport_type text,
    name text not null,
    started_at timestamptz not null,
    local_date date not null,
    distance_m numeric,
    moving_time_s int,
    elapsed_time_s int,
    elevation_gain_m numeric,
    avg_hr numeric,
    max_hr numeric,
    avg_speed_mps numeric,
    calories numeric,
    perceived_effort smallint check (perceived_effort between 1 and 10),
    notes text,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, user_id)
);

create index activities_user_id_local_date_idx on roxcoach.activities (user_id, local_date);

create unique index activities_user_id_strava_id_key
    on roxcoach.activities (user_id, strava_id)
    where strava_id is not null;

create trigger set_updated_at before update on roxcoach.activities
    for each row execute function roxcoach.set_updated_at();

-- Child tables carry their own user_id and reference (activity_id, user_id), so a child can never
-- point at another user's activity.
create table roxcoach.activity_laps (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    activity_id uuid not null,
    lap_index int not null,
    name text,
    distance_m numeric,
    elapsed_time_s int,
    moving_time_s int,
    avg_hr numeric,
    avg_speed_mps numeric,
    station roxcoach.hyrox_station,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, activity_id, lap_index),
    foreign key (activity_id, user_id)
        references roxcoach.activities (id, user_id) on delete cascade
);

create trigger set_updated_at before update on roxcoach.activity_laps
    for each row execute function roxcoach.set_updated_at();

create table roxcoach.station_results (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    activity_id uuid not null,
    station roxcoach.hyrox_station not null,
    time_s int,
    load_kg numeric,
    reps int,
    distance_m numeric,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (activity_id, user_id)
        references roxcoach.activities (id, user_id) on delete cascade
);

create index station_results_user_id_activity_id_idx
    on roxcoach.station_results (user_id, activity_id);

create trigger set_updated_at before update on roxcoach.station_results
    for each row execute function roxcoach.set_updated_at();

create table roxcoach.strength_sets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    activity_id uuid not null,
    exercise text not null,
    set_index int not null,
    reps int,
    load_kg numeric,
    rpe numeric check (rpe between 1 and 10),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (activity_id, user_id)
        references roxcoach.activities (id, user_id) on delete cascade
);

create index strength_sets_user_id_activity_id_idx
    on roxcoach.strength_sets (user_id, activity_id);

create trigger set_updated_at before update on roxcoach.strength_sets
    for each row execute function roxcoach.set_updated_at();

insert into roxcoach.schema_migrations (filename) values ('0004_training.sql');
