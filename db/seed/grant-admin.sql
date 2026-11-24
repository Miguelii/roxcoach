-- Makes one Roxcoach user an admin: only admins see the Logs link, open /logs and call logs.getAll.
--
-- How to run it:
-- 1. The user must already have Roxcoach access (db/seed/grant-access.sql or the /signup page).
-- 2. Replace the <EMAIL> placeholders below (the update and the check query) with the user's
--    sign-in email.
-- 3. Run it once in the Supabase SQL editor, as its default postgres role (the only client role
--    that may write auth.users).
-- 4. Run the check query at the end: it must return exactly one row with is_admin = true. Zero rows
--    means the email matched no user. is_admin = false means the user has no Roxcoach access, so
--    nothing was changed.
-- 5. The user must sign out and sign in again: the flag reaches the JWT
--    (app_metadata.roxcoach_admin) only when a new access token is issued. Until then the proxy
--    keeps sending /logs to /dashboard and the sidebar hides the link.
--
-- Running it again is harmless: the flag is merged into the existing app_metadata (other keys are
-- kept). To revoke it:
-- update auth.users set raw_app_meta_data = raw_app_meta_data - 'roxcoach_admin' where email = '<EMAIL>';
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"roxcoach_admin": true}'::jsonb
where email = '<EMAIL>' -- PLACEHOLDER: the user's sign-in email
    and raw_app_meta_data -> 'roxcoach' = 'true'::jsonb;

-- Check (replace <EMAIL> here too).
select
    id,
    coalesce(raw_app_meta_data -> 'roxcoach_admin' = 'true'::jsonb, false) as is_admin
from auth.users
where email = '<EMAIL>'; -- PLACEHOLDER: the user's sign-in email
