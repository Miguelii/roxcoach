begin;

-- Original files of manually uploaded activities (FIT, TCX, GPX). The bytes live in the private
-- Storage bucket 'activity-files'; this table keeps the metadata, the hash and the parse status.
create table roxcoach.activity_files (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    -- Null while parsing or after a failed parse.
    activity_id uuid,
    format text not null check (format in ('fit', 'tcx', 'gpx')),
    storage_path text not null,
    sha256 text not null,
    size_bytes int not null,
    original_name text not null,
    status text not null check (status in ('parsed', 'failed')),
    error_code text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- Blocks the same file twice for one user.
    unique (user_id, sha256),
    foreign key (activity_id, user_id)
        references roxcoach.activities (id, user_id) on delete cascade
);

create index activity_files_user_id_activity_id_idx
    on roxcoach.activity_files (user_id, activity_id);

create trigger set_updated_at before update on roxcoach.activity_files
    for each row execute function roxcoach.set_updated_at();

alter table roxcoach.activity_files enable row level security;

create policy select_own on roxcoach.activity_files for select to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());
create policy insert_own on roxcoach.activity_files for insert to authenticated
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy update_own on roxcoach.activity_files for update to authenticated
    using (user_id = auth.uid() and roxcoach.has_access())
    with check (user_id = auth.uid() and roxcoach.has_access());
create policy delete_own on roxcoach.activity_files for delete to authenticated
    using (user_id = auth.uid() and roxcoach.has_access());

-- Storage (managed by Supabase; the shared project has other buckets, so everything below is
-- scoped to the bucket id 'activity-files').

-- Private bucket, 10 MB limit. allowed_mime_types stays null: extensions are checked in code.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('activity-files', 'activity-files', false, 10485760, null)
on conflict (id) do nothing;

-- Objects live under '<user_id>/<file_id>.<format>': the first folder must be the caller's id.
create policy activity_files_select_own on storage.objects for select to authenticated
    using (
        bucket_id = 'activity-files'
        and (storage.foldername(name))[1] = auth.uid()::text
        and roxcoach.has_access()
    );
create policy activity_files_insert_own on storage.objects for insert to authenticated
    with check (
        bucket_id = 'activity-files'
        and (storage.foldername(name))[1] = auth.uid()::text
        and roxcoach.has_access()
    );
create policy activity_files_delete_own on storage.objects for delete to authenticated
    using (
        bucket_id = 'activity-files'
        and (storage.foldername(name))[1] = auth.uid()::text
        and roxcoach.has_access()
    );

insert into roxcoach.schema_migrations (filename) values ('0008_activity_files.sql');
commit;
