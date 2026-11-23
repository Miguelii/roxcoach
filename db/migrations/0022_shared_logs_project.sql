begin;

-- public.logs is shared with another app in the same Supabase project (see CLAUDE.md). The create
-- keeps fresh databases and the PGlite tests working; on the real database it already exists.
create table if not exists public.logs (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    level text not null check (level in ('debug', 'info', 'warn', 'error')),
    prefix text not null,
    message text,
    metadata jsonb,
    user_id uuid references auth.users (id) on delete set null
);

-- Existing rows and the other app's inserts keep the default; Roxcoach writes 'roxcoach'.
alter table public.logs add column if not exists project text not null default 'wallet';

create index if not exists logs_created_at_idx on public.logs (created_at desc);
create index if not exists logs_level_created_at_idx on public.logs (level, created_at desc);
create index if not exists logs_project_created_at_idx on public.logs (project, created_at desc);

alter table public.logs enable row level security;

insert into roxcoach.schema_migrations (filename) values ('0022_shared_logs_project.sql');
commit;
