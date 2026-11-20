# Database

Roxcoach's schema lives in `db/migrations/` as numbered SQL files. Everything is created in the
`roxcoach` schema because the Supabase project is shared with another app (see
`docs/tech-specs/database.md`, "Shared project rules"). Nothing is created in `public`.

## Applying the migrations to the shared project

The order matters. Until `0006` has run, the tables carry the default `authenticated` grants with
RLS off, and sign-ups are open on the shared project (the other app's publishable key is public).
If the `roxcoach` schema were exposed to the API before `0006`, anyone could insert rows in that
window. So the schema is exposed only at the end.

1. Run the "Before you start" checks of the rollout checklist below (nothing is changed yet).
2. Check what is already applied (skip this on the very first run, the table does not exist yet):

    ```sql
    select filename, applied_at from roxcoach.schema_migrations order by filename;
    ```

3. Open the SQL editor and run each file that is not listed yet, one at a time, in filename order
   (`0001_schema_and_enums.sql`, `0002_athlete_and_races.sql`, `0003_strava.sql`,
   `0004_training.sql`, `0005_coach_and_plan.sql`, `0006_rls.sql`, `0007_remove_strava.sql`, then later files). Paste the
   whole file and run it. Each file records itself in `roxcoach.schema_migrations` as its last
   statement.
4. Run the files as the default `postgres` role of the SQL editor. `0001` sets default privileges
   `for role postgres`, so they apply only to tables that role creates.
5. Run the verification queries of the rollout checklist ("After the last file"). Only when they
   all pass, add `roxcoach` to "Exposed schemas" (Project Settings, API).

### Atomic files, not idempotent files

Every file is wrapped in `begin;` ... `commit;`, so a file either applies completely or not at
all: if a statement fails, the `commit;` is never reached and nothing from that file is kept. If
the SQL editor keeps the failed transaction open, run `rollback;` before the next attempt. None of the statements needs to run outside a transaction (no
`concurrently` index, no `alter type ... add value`), and `db/tests/migrations.test.ts` keeps it
that way.

The files are **not idempotent**: running one that already succeeded fails (`create table` and
`create type` have no `if not exists`). So:

- Always check `roxcoach.schema_migrations` first and run only the files that are not listed.
- If a file fails, nothing of it was applied: fix the cause (see the error) and run the same file
  again. Check that `roxcoach.schema_migrations` does not list it before you do.
- If you ever ran a file in pieces (outside the transaction wrapper) and it stopped midway, the
  schema is half applied and re-running it fails on the first object that exists. Nothing has
  been exposed to the API at this point, and Roxcoach is independent of the other app, so the
  clean recovery is `drop schema roxcoach cascade;` (see "Rolling back") and starting again from
  `0001`.

## Rollout checklist

Human checks, in order. Tick them off as you go; none of them is automated.

### Before you start

- [ ] `select version();` reports PostgreSQL 15 or newer (`0005` uses
      `on delete set null (column)`).
- [ ] `select current_user;` returns `postgres`.
- [ ] Save the output of the two `public` queries from "Confirming nothing landed in `public`"
      before the first file.

### After the last file

- [ ] Compare the two `public` queries with the saved output: identical.
- [ ] Every Roxcoach table is empty, as it must be before the seed. Run each of these and expect
      `0` (the only table that has rows is `schema_migrations`):

    ```sql
    select
        (select count(*) from roxcoach.athlete_profiles) as athlete_profiles,
        (select count(*) from roxcoach.availability_slots) as availability_slots,
        (select count(*) from roxcoach.races) as races,
        (select count(*) from roxcoach.activities) as activities,
        (select count(*) from roxcoach.activity_laps) as activity_laps,
        (select count(*) from roxcoach.station_results) as station_results,
        (select count(*) from roxcoach.strength_sets) as strength_sets,
        (select count(*) from roxcoach.weekly_reports) as weekly_reports,
        (select count(*) from roxcoach.planned_sessions) as planned_sessions;
    ```

- [ ] Grants and RLS. Run these four queries:

    ```sql
    -- 1. No privilege for anon on any table: must return no rows.
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'roxcoach' and c.relkind = 'r'
      and has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger');

    -- 2. No privilege for authenticated on the service-only tables: must return no rows.
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'roxcoach'
      and c.relname in ('schema_migrations')
      and has_table_privilege('authenticated', c.oid, 'select, insert, update, delete, truncate, references, trigger');

    -- 3. anon has no usage on the schema: must return false.
    select has_schema_privilege('anon', 'roxcoach', 'usage');

    -- 4. RLS is on for every table: must return no rows.
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'roxcoach' and c.relkind = 'r' and not c.relrowsecurity;
    ```

- [ ] `select filename from roxcoach.schema_migrations order by filename;` lists `0001` to `0006`.

### Exposing the schema

- [ ] In Project Settings, API, **append** `roxcoach` to "Exposed schemas". Do not replace the
      list: the other app depends on its entries. Save, then confirm the other app still works.

### Granting the first user

- [ ] Confirm no Custom Access Token hook drops `app_metadata` from the JWT (Authentication,
      Hooks). A hook that rebuilds the claims without it would make every login fail the flag
      check.
- [ ] The seed email is written lowercase, exactly as stored in `auth.users`. The check query at
      the end of `db/seed/grant-access.sql` must return exactly one row (zero rows: the email
      matched no user and nothing changed; two or more should be impossible, stop if it happens).
- [ ] After the seed (see "Granting access to a user"), sign in and decode the first access token
      locally (base64-decode its middle segment, and never paste a real token into a website): it
      must carry `app_metadata.roxcoach = true`.
- [ ] JWT expiry is how long a revoked flag keeps working at the proxy and in RLS (both read the
      JWT). Check the setting (Authentication, Sessions) and accept it, or shorten it.
      `protectedProcedure` checks the live user and reacts at once.

### First login

- [ ] First login sets the session cookies (`sb-...-auth-token`) and lands on `/dashboard`.
- [ ] An account without the flag gets the generic "Invalid email or password" error and leaves
      no `sb-*-auth-token` cookie behind.
- [ ] Logging out of Roxcoach must **not** sign the other app out (logout uses local scope). Check
      the other app is still signed in in the same browser, and on another device if you can.

### Production

- [ ] The response headers include the Content-Security-Policy.
- [ ] `Cache-Control` is never `public` on an HTML response, and the CDN does not serve cached HTML
      for a signed-in page (reload while signed out of a second browser profile and confirm it
      redirects to `/login`).

## Row Level Security

`0006_rls.sql` enables RLS on every table. The client tables get one policy per operation, each
`user_id = auth.uid() and roxcoach.has_access()`. `roxcoach.has_access()` is true only when the
JWT carries `app_metadata.roxcoach` as the JSON boolean `true`, so a signed-in user of the other
app sees and writes nothing. `schema_migrations` has RLS on, no policies and no privileges for `authenticated` or `anon`:
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
   and until then RLS and the proxy refuse the user.

Revoking access is the reverse: remove the key with
`update auth.users set raw_app_meta_data = raw_app_meta_data - 'roxcoach' where email = '<EMAIL>';`.
RLS and the proxy stop honouring the old JWT only when it is reissued (it expires after about 1
hour by default). `protectedProcedure` checks the live user and refuses at once.

## Confirming nothing landed in `public`

Before the first migration (rollout checklist, "Before you start"), note what `public` contains:

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
- `migrations.test.ts`: every file is wrapped in `begin;` ... `commit;` and records itself last.
- `rls.test.ts`: RLS is on for every table, the policies, the service-only revokes, `has_access()`
  and the self-grant attempts (`user_metadata`, null, object and string flags).
- `tenant-isolation.test.ts`: users A and B (with the flag) and C (without) against every table
  found in the schema, so a table added without policies or fixtures fails the suite.
- `seed.test.ts`: runs `db/seed/grant-access.sql` with its placeholders filled.
