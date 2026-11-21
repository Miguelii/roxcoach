-- Grants one existing user access to Roxcoach and creates their athlete profile.
--
-- How to run it:
-- 1. The user must already exist in auth.users (a user of the other app, or one created by hand in
--    the dashboard: Authentication, Users, email and password, auto-confirmed).
-- 2. Replace the two placeholders below: <EMAIL> (the user's sign-in email) and <DISPLAY_NAME>.
-- 3. Run it once in the Supabase SQL editor, as its default postgres role (the only client role
--    that may write auth.users and bypass RLS on roxcoach.athlete_profiles).
-- 4. Run the check query at the end: it must return exactly one row with has_flag = true and
--    has_profile = true. Zero rows means the email matched no user and nothing was changed.
-- 5. The user must sign out and sign in again: the flag reaches the JWT (app_metadata.roxcoach)
--    only when a new access token is issued.
--
-- Running it again is harmless: the flag is merged into the existing app_metadata (other keys are
-- kept) and an existing profile is left as it is.
--
-- New users do not need this script: the /signup page grants access by itself with the same function
-- (roxcoach.grant_access, migration 0017). Use the script for an account that already exists, for
-- example a user of the other app.
select roxcoach.grant_access(id, '<DISPLAY_NAME>') -- PLACEHOLDER: the name shown in the app
from auth.users
where email = '<EMAIL>'; -- PLACEHOLDER: the user's sign-in email

-- Check (replace <EMAIL> here too).
select
    u.id,
    u.raw_app_meta_data -> 'roxcoach' = 'true'::jsonb as has_flag,
    p.user_id is not null as has_profile
from auth.users u
left join roxcoach.athlete_profiles p on p.user_id = u.id
where u.email = '<EMAIL>'; -- PLACEHOLDER: the user's sign-in email
