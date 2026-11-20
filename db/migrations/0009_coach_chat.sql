begin;

-- The coach becomes a chat. The weekly report and the generated plan are removed: planned_sessions
-- goes first because it references weekly_reports, then the enum types they used.
drop table roxcoach.planned_sessions;
drop table roxcoach.weekly_reports;
drop type roxcoach.report_status;
drop type roxcoach.planned_session_status;

-- One row per chat with the coach.
create table roxcoach.coach_conversations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    -- Null until the first exchange names the conversation.
    title text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- Target of the composite foreign key from coach_messages.
    unique (id, user_id)
);

create index coach_conversations_user_id_updated_at_idx
    on roxcoach.coach_conversations (user_id, updated_at desc);

create trigger set_updated_at before update on roxcoach.coach_conversations
    for each row execute function roxcoach.set_updated_at();

-- Messages are append-only, so there is no updated_at column and no trigger.
create table roxcoach.coach_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    conversation_id uuid not null,
    role text not null check (role in ('user', 'assistant')),
    content text not null,
    -- Model id and token counts of an assistant reply; null for user messages.
    model text,
    prompt_tokens int,
    completion_tokens int,
    created_at timestamptz not null default now(),
    foreign key (conversation_id, user_id)
        references roxcoach.coach_conversations (id, user_id) on delete cascade
);

create index coach_messages_conversation_id_created_at_idx
    on roxcoach.coach_messages (conversation_id, created_at);

alter table roxcoach.coach_conversations enable row level security;
alter table roxcoach.coach_messages enable row level security;

create policy select_own on roxcoach.coach_conversations for select to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());
create policy insert_own on roxcoach.coach_conversations for insert to authenticated
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy update_own on roxcoach.coach_conversations for update to authenticated
    using (user_id = auth.uid() and roxcoach.has_access())
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy delete_own on roxcoach.coach_conversations for delete to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());

-- 0006 gives every client table all four policies, even those that are rarely edited: same here.
create policy select_own on roxcoach.coach_messages for select to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());
create policy insert_own on roxcoach.coach_messages for insert to authenticated
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy update_own on roxcoach.coach_messages for update to authenticated
    using (user_id = auth.uid() and roxcoach.has_access())
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy delete_own on roxcoach.coach_messages for delete to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());

insert into roxcoach.schema_migrations (filename) values ('0009_coach_chat.sql');
commit;
