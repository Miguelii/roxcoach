# Database

Roxcoach's schema lives in `db/migrations/` as numbered SQL files. Everything is created in the
`roxcoach` schema because the Supabase project is shared with another app (see
`specs/database.md`, "Shared project rules"). Nothing is created in `public`.

## Applying the migrations to the shared project

1. In the Supabase dashboard, open Project Settings, API, and add `roxcoach` to "Exposed schemas".
2. Check what is already applied (skip this on the very first run, the table does not exist yet):

    ```sql
    select filename, applied_at from roxcoach.schema_migrations order by filename;
    ```

3. Open the SQL editor and run each file that is not listed yet, one at a time, in filename order
   (`0001_schema_and_enums.sql`, `0002_athlete_and_races.sql`, `0003_strava.sql`,
   `0004_training.sql`, `0005_coach_and_plan.sql`, `0006_rls.sql`, then later files). Paste the
   whole file and run it. Each file ends by recording itself in `roxcoach.schema_migrations`.
4. Run the files as the default `postgres` role of the SQL editor. `0001` sets default privileges
   `for role postgres`, so they apply only to tables that role creates.
5. Check that RLS is on for every table (the query must return no rows):

    ```sql
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'roxcoach' and c.relkind = 'r' and not c.relrowsecurity;
    ```

## Row Level Security

`0006_rls.sql` enables RLS on every table. The client tables get one policy per operation, each
`user_id = auth.uid() and roxcoach.has_access()`. `roxcoach.has_access()` is true only when the
JWT carries `app_metadata.roxcoach` as the JSON boolean `true`, so a signed-in user of the other
app sees and writes nothing. `strava_connections`, `strava_webhook_events` and
`schema_migrations` have RLS on, no policies and no privileges for `authenticated` or `anon`:
only the service role (which bypasses RLS) touches them.

## Granting access to a user

Do this once per user, after the migrations:

1. Make sure the user exists in `auth.users` (a user of the other app, or one created by hand in
   Authentication, Users, email and password, auto-confirmed).
2. Open `db/seed/grant-access.sql`, replace the `<EMAIL>` and `<DISPLAY_NAME>` placeholders and
   run it in the SQL editor as the default `postgres` role. It sets `app_metadata.roxcoach = true`
   and inserts the user's `athlete_profiles` row. Running it twice is harmless.
3. Run the check query at the end of the file: one row with `has_flag` and `has_profile` both
   `true`. No row means the email matched no user.
4. The user signs out and signs in again. The flag reaches the JWT only with a new access token,
   and until then RLS returns nothing.

Revoking access is the reverse: remove the key with
`update auth.users set raw_app_meta_data = raw_app_meta_data - 'roxcoach' where email = '<EMAIL>';`.
RLS stops honouring the old JWT only when it expires (about 1 hour).

## Confirming nothing landed in `public`

Before the first migration, note what `public` contains:

```sql
select table_name from information_schema.tables where table_schema = 'public' order by 1;
select typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typtype = 'e' order by 1;
```

Run the same queries after applying the files: the results must be identical. Then check that the
Roxcoach objects are where they should be:

```sql
select table_name from information_schema.tables where table_schema = 'roxcoach' order by 1;
```

## Rolling back

Roxcoach is independent of the other app, so a full rollback is:

```sql
drop schema roxcoach cascade;
```

## Tests

`db/tests/` runs every migration in an in-process PGlite database with small stand-ins for what
Supabase provides (`auth.users`, `auth.uid()`, `auth.jwt()` and the `anon`, `authenticated` and
`service_role` roles). They run with `pnpm test` and never touch a real database.

- `schema.test.ts` and `tenant-keys.test.ts`: tables, grants, unique keys, composite foreign keys.
- `rls.test.ts`: RLS is on for every table, the policies, the service-only revokes and
  `has_access()`.
- `tenant-isolation.test.ts`: users A and B (with the flag) and C (without) against every table
  found in the schema, so a table added without policies or fixtures fails the suite.
- `seed.test.ts`: runs `db/seed/grant-access.sql` with its placeholders filled.
