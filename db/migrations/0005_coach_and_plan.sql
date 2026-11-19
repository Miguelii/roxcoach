create table roxcoach.weekly_reports (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    week_start date not null,
    status roxcoach.report_status not null,
    headline text,
    summary text,
    went_well jsonb not null default '[]'::jsonb,
    watch_out jsonb not null default '[]'::jsonb,
    follow_ups jsonb not null default '[]'::jsonb,
    next_week_focus text,
    race_outlook jsonb not null default '[]'::jsonb,
    goal_check text,
    metrics jsonb not null default '{}'::jsonb,
    memory_report_ids uuid [] not null default '{}',
    model text not null,
    prompt_version text not null,
    error text,
    generated_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, week_start),
    unique (id, user_id)
);

-- Memory lookup reads the most recent reports first.
create index weekly_reports_user_id_week_start_desc_idx
    on roxcoach.weekly_reports (user_id, week_start desc);

create trigger set_updated_at before update on roxcoach.weekly_reports
    for each row execute function roxcoach.set_updated_at();

-- Optional links use "on delete set null (column)" (PostgreSQL 15+): deleting a race or an
-- activity clears only the link column and never user_id.
create table roxcoach.planned_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    report_id uuid not null,
    race_id uuid,
    planned_date date not null,
    session_kind roxcoach.session_kind not null,
    title text not null,
    description text not null,
    target_minutes int,
    target_distance_m int,
    status roxcoach.planned_session_status not null default 'planned',
    matched_activity_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (report_id, user_id)
        references roxcoach.weekly_reports (id, user_id) on delete cascade,
    foreign key (race_id, user_id)
        references roxcoach.races (id, user_id) on delete set null (race_id),
    foreign key (matched_activity_id, user_id)
        references roxcoach.activities (id, user_id) on delete set null (matched_activity_id)
);

create index planned_sessions_user_id_planned_date_idx
    on roxcoach.planned_sessions (user_id, planned_date);

create trigger set_updated_at before update on roxcoach.planned_sessions
    for each row execute function roxcoach.set_updated_at();

insert into roxcoach.schema_migrations (filename) values ('0005_coach_and_plan.sql');
