begin;

-- Grants one existing user access to Roxcoach: sets the app_metadata.roxcoach flag and creates the
-- athlete profile, in one transaction. It holds the statements of db/seed/grant-access.sql so the
-- manual script and the sign-up page share one implementation. Only the service role can run it:
-- a signed-in user must never be able to grant themselves access through the API.
create or replace function roxcoach.grant_access(p_user_id uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"roxcoach": true}'::jsonb
    where id = p_user_id;

    if not found then
        raise exception 'user % does not exist', p_user_id;
    end if;

    insert into roxcoach.athlete_profiles (user_id, display_name)
    values (p_user_id, p_display_name)
    on conflict (user_id) do nothing;
end;
$$;

revoke all on function roxcoach.grant_access(uuid, text) from public, anon, authenticated;
grant execute on function roxcoach.grant_access(uuid, text) to service_role;

insert into roxcoach.schema_migrations (filename) values ('0017_grant_access_fn.sql');
commit;
