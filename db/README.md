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
   `0004_training.sql`, `0005_coach_and_plan.sql`, then later files). Paste the whole file and run
   it. Each file ends by recording itself in `roxcoach.schema_migrations`.
4. Run the files as the default `postgres` role of the SQL editor. The default privileges set in
   `0001` apply to tables created by that same role.

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
