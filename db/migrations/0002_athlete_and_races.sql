create table roxcoach.athlete_profiles (
    user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
    display_name text not null,
    timezone text not null default 'Europe/Lisbon',
    max_hr int,
    resting_hr int,
    hyrox_division text,
    weekly_hours_cap numeric,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on roxcoach.athlete_profiles
    for each row execute function roxcoach.set_updated_at();

create table roxcoach.availability_slots (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    weekday smallint not null check (weekday between 1 and 7),
    session_kind roxcoach.session_kind not null,
    is_fixed boolean not null,
    max_minutes int,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, weekday, session_kind)
);

create trigger set_updated_at before update on roxcoach.availability_slots
    for each row execute function roxcoach.set_updated_at();

create table roxcoach.races (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    name text not null,
    race_type roxcoach.race_type not null,
    race_date date not null,
    location text,
    distance_m int,
    hyrox_division text,
    target_time_s int not null,
    priority roxcoach.race_priority not null default 'A',
    status roxcoach.race_status not null default 'upcoming',
    result_time_s int,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, user_id),
    check (race_type <> 'running' or distance_m is not null),
    check (race_type <> 'hyrox' or (hyrox_division is not null and distance_m is null))
);

create index races_user_id_race_date_idx on roxcoach.races (user_id, race_date);

create trigger set_updated_at before update on roxcoach.races
    for each row execute function roxcoach.set_updated_at();

insert into roxcoach.schema_migrations (filename) values ('0002_athlete_and_races.sql');
