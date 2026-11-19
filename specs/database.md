# Database

Supabase Postgres in an **existing project that is shared with another app** (the free plan does
not allow another project). Migrations live in `db/migrations/` as numbered SQL files, applied in
order. Every table has Row Level Security enabled.

## Shared project rules

Because the project is shared, nothing of Roxcoach may touch what already exists:

1. **Own schema.** Every table, enum, function and policy lives in the `roxcoach` schema. Nothing is
   created in `public`, so table names such as `activities` or `races` cannot collide with the
   other app. Migrations are written schema-qualified (`create table roxcoach.activities ...`).
2. **Grant explicitly, expose last.** `0001` grants access explicitly:
    - `grant usage on schema roxcoach to authenticated, service_role;`
    - `grant select, insert, update, delete on all tables in schema roxcoach to authenticated;`
    - `grant all on all tables in schema roxcoach to service_role;`
    - the same with `alter default privileges for role postgres in schema roxcoach ...` so later
      tables created by `postgres` (the SQL editor role that runs the migrations) follow.
    - nothing is granted to `anon`.
    - `0006` revokes every privilege on the service-only tables (`strava_connections`,
      `strava_webhook_events`, `schema_migrations`) from `authenticated` and `anon`.

    The schema is added to the API only after `0006` has been applied and verified: in Supabase,
    Project Settings, API, append `roxcoach` to "Exposed schemas" (never replace the list, the other
    app depends on it). Between `0002` and `0006` the tables carry the `authenticated` grants with
    RLS off, and sign-ups are open on the shared project, so exposing the schema earlier would let
    anyone insert rows in that window. Each migration file is wrapped in `begin; ... commit;` so it
    applies atomically. The files are not idempotent: see `db/README.md` for the rollout checklist
    and what to check when one fails.

3. **Clients select the schema.** Every Supabase client is created with `db: { schema: 'roxcoach' }`
   (see [auth-security.md](auth-security.md)). Auth calls are unaffected.
4. **`auth.users` is shared.** Users of the other app are also rows in `auth.users`. Roxcoach
   therefore cannot assume "a signed-in user is mine". Access is an explicit flag, described in
   [auth-security.md](auth-security.md) (`app_metadata.roxcoach = true`), and RLS checks it with
   `roxcoach.has_access()`.
5. **Shared extensions and jobs.** `pg_cron`, `pg_net` and Vault already serve the whole database.
   Roxcoach's jobs and secrets are named with the prefix `roxcoach-`.
6. **No change to the other app's objects**, auth settings that it depends on (sign-ups, email
   templates, providers) or its policies. Roxcoach migrations are independent and can be rolled
   back by dropping the `roxcoach` schema.
7. **Migration tracking.** Roxcoach keeps its own `db/migrations/` and records applied files in
   `roxcoach.schema_migrations`, so it never mixes with the other app's migration history. The
   table has RLS enabled with no policies and no client privileges: service role only.

## Conventions

- All objects are in the `roxcoach` schema. Examples below omit the prefix for readability.
- Primary keys are `uuid default gen_random_uuid()` unless noted.
- **Every table has a `user_id`** (see "Multi-user from day one" below), declared
  `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`. The one
  exception is `strava_webhook_events`, where it is nullable (the owner may be unknown).
- `created_at timestamptz not null default now()` everywhere, `updated_at` where rows are edited
  (maintained by a shared `set_updated_at()` trigger).
- Times are stored in seconds (`*_s`), distances in meters (`*_m`), speeds in meters per second
  (`*_mps`), loads in kilograms (`*_kg`). Display formatting happens in the app.
- Optional values are `NULL`, never the string `'N/A'`. Formatters turn `NULL` into display text.
- All dates and times are `timestamptz`, except calendar days (`date`) for races and planned
  sessions, which are local days in the athlete's timezone.

## Multi-user from day one

The app has one athlete today, but nothing in the schema or the queries may assume it. These rules
make a second user work with no migration:

1. **`user_id` on every table, child tables included.** A child row (laps, station results, sets,
   planned sessions) carries its own `user_id`, so every RLS policy is the same one-liner and no
   policy needs a join.
2. **Composite foreign keys keep tenants apart.** Each parent table has `unique (id, user_id)`, and
   each child references `(parent_id, user_id)` instead of `parent_id` alone. A child can then never
   point at another user's parent, even by mistake from service-role code.
   Optional links use `on delete set null (<link column>)` (PostgreSQL 15 or later), so deleting the
   parent clears only the link column and never `user_id`.
3. **Every unique constraint and every index starts with `user_id`**, for example
   `(user_id, weekday, session_kind)`, `(user_id, local_date)`, `(user_id, week_start)`.
4. **Deleting a user deletes everything.** `on delete cascade` from `auth.users` on every
   `user_id`.
5. **Service-role code does not get RLS.** Jobs, the webhook and the report generator use the
   service-role client, which bypasses RLS. Every repository function therefore receives `userId`
   as an explicit parameter and filters or inserts with it (see [architecture.md](architecture.md)).
   Nothing may read a table without a `user_id` condition.
6. **Global identifiers map to exactly one user.** `strava_athlete_id` is unique across the table:
   one Strava account belongs to one Roxcoach user, and the webhook resolves `owner_id` to a
   `user_id` through `strava_connections`.
7. **Profile row per user.** Today it is inserted by hand. A later `on auth.users insert` trigger
   can create it, with no schema change.

## Enums

| Enum                     | Values                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `activity_source`        | `strava`, `manual`                                                                                                  |
| `activity_category`      | `run`, `hyrox`, `strength`, `cross`, `other`                                                                        |
| `session_kind`           | `hyrox`, `run`, `strength`, `cross`, `rest`                                                                         |
| `race_type`              | `hyrox`, `running`, `other`                                                                                         |
| `race_priority`          | `A`, `B`, `C`                                                                                                       |
| `race_status`            | `upcoming`, `completed`, `cancelled`                                                                                |
| `hyrox_station`          | `ski_erg`, `sled_push`, `sled_pull`, `burpee_broad_jump`, `rowing`, `farmers_carry`, `sandbag_lunges`, `wall_balls` |
| `report_status`          | `generating`, `ready`, `failed`                                                                                     |
| `planned_session_status` | `planned`, `done`, `skipped`                                                                                        |
| `webhook_event_status`   | `received`, `processed`, `ignored`, `failed`                                                                        |

## Tables

### `athlete_profiles`

One row per user (`user_id` is the primary key).

| Column             | Type          | Notes                                                                     |
| ------------------ | ------------- | ------------------------------------------------------------------------- |
| `display_name`     | text          |                                                                           |
| `timezone`         | text not null | default `Europe/Lisbon`                                                   |
| `max_hr`           | int null      |                                                                           |
| `resting_hr`       | int null      |                                                                           |
| `hyrox_division`   | text null     | for example `open_men`, `pro_women`; keys defined in `hyrox.constants.ts` |
| `weekly_hours_cap` | numeric null  | upper bound the coach must respect                                        |
| `notes`            | text null     | injuries, constraints, preferences                                        |

### `availability_slots`

The athlete's typical week. A slot says what happens or can happen on a weekday.

| Column         | Type           | Notes                                                                                                    |
| -------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| `weekday`      | smallint       | ISO, 1 = Monday to 7 = Sunday, check 1..7                                                                |
| `session_kind` | `session_kind` |                                                                                                          |
| `is_fixed`     | boolean        | `true`: commitment that already exists (for example a Hyrox class). `false`: open slot the coach may use |
| `max_minutes`  | int null       | upper bound for the session length                                                                       |
| `notes`        | text null      |                                                                                                          |

Unique on `(user_id, weekday, session_kind)`. A `rest` slot marks a day with nothing allowed.

### `races`

| Column           | Type            | Notes                                    |
| ---------------- | --------------- | ---------------------------------------- |
| `name`           | text not null   | for example `S. Silvestre Guimaraes 10k` |
| `race_type`      | `race_type`     |                                          |
| `race_date`      | date not null   |                                          |
| `location`       | text null       |                                          |
| `distance_m`     | int null        | required for `running`, null for `hyrox` |
| `hyrox_division` | text null       | required for `hyrox`                     |
| `target_time_s`  | int not null    | the goal, for example 4200 for 1h10      |
| `priority`       | `race_priority` | default `A`. See [plan.md](plan.md)      |
| `status`         | `race_status`   | default `upcoming`                       |
| `result_time_s`  | int null        | filled after the race                    |
| `notes`          | text null       |                                          |

Index on `(user_id, race_date)`.

### `strava_connections`

One row per user (`user_id` is the primary key). Sensitive: no client policy, only the service-role
client reads or writes it.

| Column              | Type                   | Notes |
| ------------------- | ---------------------- | ----- |
| `strava_athlete_id` | bigint unique not null |       |
| `access_token`      | text not null          |       |
| `refresh_token`     | text not null          |       |
| `expires_at`        | timestamptz not null   |       |
| `scope`             | text not null          |       |
| `connected_at`      | timestamptz            |       |
| `last_synced_at`    | timestamptz null       |       |

### `strava_webhook_events`

Idempotency and audit for the webhook. Service-role only.

| Column        | Type                   | Notes                                                     |
| ------------- | ---------------------- | --------------------------------------------------------- |
| `user_id`     | uuid null              | resolved from `owner_id`; null when no connection matches |
| `object_type` | text                   | `activity` or `athlete`                                   |
| `object_id`   | bigint                 |                                                           |
| `aspect_type` | text                   | `create`, `update`, `delete`                              |
| `owner_id`    | bigint                 | Strava athlete id                                         |
| `event_time`  | timestamptz            |                                                           |
| `status`      | `webhook_event_status` |                                                           |
| `error`       | text null              |                                                           |

Unique on `(owner_id, object_type, object_id, aspect_type, event_time)` so a redelivered event is
a no-op. Index on `(user_id, event_time desc)`.

### `activities`

Every workout, from Strava or entered by hand.

| Column             | Type                | Notes                                                   |
| ------------------ | ------------------- | ------------------------------------------------------- |
| `source`           | `activity_source`   |                                                         |
| `strava_id`        | bigint null         | unique per user when present                            |
| `category`         | `activity_category` | derived from the Strava sport type or chosen manually   |
| `sport_type`       | text null           | raw Strava value, for example `Run`, `WeightTraining`   |
| `name`             | text                |                                                         |
| `started_at`       | timestamptz         |                                                         |
| `local_date`       | date                | the day in the athlete's timezone, used by the calendar |
| `distance_m`       | numeric null        |                                                         |
| `moving_time_s`    | int null            |                                                         |
| `elapsed_time_s`   | int null            |                                                         |
| `elevation_gain_m` | numeric null        |                                                         |
| `avg_hr`           | numeric null        |                                                         |
| `max_hr`           | numeric null        |                                                         |
| `avg_speed_mps`    | numeric null        |                                                         |
| `calories`         | numeric null        |                                                         |
| `perceived_effort` | smallint null       | RPE 1..10, entered by hand, applies to both sources     |
| `notes`            | text null           |                                                         |
| `deleted_at`       | timestamptz null    | soft delete when Strava reports deletion                |

Index on `(user_id, local_date)`. Unique on `(user_id, strava_id)` where `strava_id is not null`.
Also `unique (id, user_id)` so children can reference it with a composite key.

### `activity_laps`

Every child table below has its own `user_id` and a composite foreign key
`(activity_id, user_id)` to `activities (id, user_id)`.

| Column           | Type                                           | Notes                                               |
| ---------------- | ---------------------------------------------- | --------------------------------------------------- |
| `activity_id`    | uuid references `activities` on delete cascade |                                                     |
| `lap_index`      | int                                            |                                                     |
| `name`           | text null                                      |                                                     |
| `distance_m`     | numeric null                                   |                                                     |
| `elapsed_time_s` | int null                                       |                                                     |
| `moving_time_s`  | int null                                       |                                                     |
| `avg_hr`         | numeric null                                   |                                                     |
| `avg_speed_mps`  | numeric null                                   |                                                     |
| `station`        | `hyrox_station` null                           | set when a lap is recognised or tagged as a station |

Unique on `(user_id, activity_id, lap_index)`. A Strava sync replaces an activity's laps by deleting
the old rows and then inserting the new ones (not atomic: a failed insert leaves no laps until the
retried sync rewrites them).

### `station_results`

Hand-entered Hyrox station data. See [manual-logging.md](manual-logging.md).

| Column        | Type                                           | Notes |
| ------------- | ---------------------------------------------- | ----- |
| `activity_id` | uuid references `activities` on delete cascade |       |
| `station`     | `hyrox_station`                                |       |
| `time_s`      | int null                                       |       |
| `load_kg`     | numeric null                                   |       |
| `reps`        | int null                                       |       |
| `distance_m`  | numeric null                                   |       |

### `strength_sets`

| Column        | Type                                           | Notes |
| ------------- | ---------------------------------------------- | ----- |
| `activity_id` | uuid references `activities` on delete cascade |       |
| `exercise`    | text not null                                  |       |
| `set_index`   | int                                            |       |
| `reps`        | int null                                       |       |
| `load_kg`     | numeric null                                   |       |
| `rpe`         | numeric null                                   | 1..10 |

### `weekly_reports`

One report per week, written every Sunday night by the coach (see [coach.md](coach.md)).

| Column              | Type             | Notes                                                                  |
| ------------------- | ---------------- | ---------------------------------------------------------------------- |
| `week_start`        | date             | Monday of the reported ISO week. Unique with `user_id`                 |
| `status`            | `report_status`  | `generating`, `ready` or `failed`                                      |
| `headline`          | text null        | one sentence                                                           |
| `summary`           | text null        | review of the week                                                     |
| `went_well`         | jsonb            | array of strings                                                       |
| `watch_out`         | jsonb            | array of strings                                                       |
| `follow_ups`        | jsonb            | array of `{ topic, status, note }`, status `resolved`, `open`, `worse` |
| `next_week_focus`   | text null        |                                                                        |
| `race_outlook`      | jsonb            | array of `{ race_id, weeks_to_go, note }`                              |
| `goal_check`        | text null        | only when a goal looks unrealistic                                     |
| `metrics`           | jsonb            | computed in code: minutes, sessions, run km, load ratio, adherence     |
| `memory_report_ids` | uuid[]           | the up to 3 reports that were in the context                           |
| `model`             | text             | model id used                                                          |
| `prompt_version`    | text             |                                                                        |
| `error`             | text null        | safe message when `failed`                                             |
| `generated_at`      | timestamptz null |                                                                        |

Unique on `(user_id, week_start)`. Index on `(user_id, week_start desc)` for the memory lookup. Also
`unique (id, user_id)` for the composite reference from `planned_sessions`.

### `planned_sessions`

| Column                | Type                                                 | Notes                                  |
| --------------------- | ---------------------------------------------------- | -------------------------------------- |
| `report_id`           | uuid references `weekly_reports` on delete cascade   | the report that proposed the session   |
| `race_id`             | uuid null references `races` on delete set null      | the race this session builds toward    |
| `planned_date`        | date                                                 |                                        |
| `session_kind`        | `session_kind`                                       |                                        |
| `title`               | text                                                 |                                        |
| `description`         | text                                                 | what to do, pacing and effort guidance |
| `target_minutes`      | int null                                             |                                        |
| `target_distance_m`   | int null                                             |                                        |
| `status`              | `planned_session_status`                             | default `planned`                      |
| `matched_activity_id` | uuid null references `activities` on delete set null |                                        |

Index on `(user_id, planned_date)`. Composite foreign keys: `(report_id, user_id)` to
`weekly_reports`, `(race_id, user_id)` to `races` and `(matched_activity_id, user_id)` to
`activities`, the last two with `on delete set null (<column>)`.

## Row Level Security

- Every table: `enable row level security`, `schema_migrations` included. Not `force row level
  security`: forcing only affects the table owner (`postgres`), which runs the migrations, the seed
  and the `auth.users` cascades. Clients never connect as the owner and `service_role` bypasses RLS
  through `BYPASSRLS` either way.
- Every table with a client-facing use (all except the three no-policy tables below,
  `strava_connections`, `strava_webhook_events` and `schema_migrations`): one policy per operation, `select`, `insert`, `update` and `delete`,
  `to authenticated`, with `using (user_id = auth.uid() and roxcoach.has_access())` and, for
  writes, `with check (user_id = auth.uid() and roxcoach.has_access())`. The policy is identical on
  every table because every table, children included, carries `user_id`.
- `roxcoach.has_access()` is a stable SQL function, `security invoker` with `search_path = ''`,
  returning `coalesce(auth.jwt() -> 'app_metadata' -> 'roxcoach' = 'true'::jsonb, false)`. The
  flag is compared as jsonb because `(... ->> 'roxcoach')::boolean` also accepts the strings
  `"true"`, `"t"`, `"yes"`, `"on"` and `"1"` and raises an error for other strings: access is the
  JSON boolean `true` only. Execute is granted to `authenticated` and `service_role`, revoked from
  `public`. `app_metadata` can only be written with the service role, never by the user, so a user
  of the other app cannot grant themselves access and cannot create rows in Roxcoach tables.
- `strava_connections`, `strava_webhook_events` and `schema_migrations`: RLS on, **no policies**,
  and no privileges for `authenticated` or `anon` (a client query fails with a permission error).
  Only the service-role client touches them, from server code and jobs. Tokens are never exposed
  to a client session, even if a policy were added by mistake.
- tRPC services use the session-bound client (publishable key), so RLS is a second layer under the
  `user_id` filters in the repositories.
- Jobs, the webhook handler and the report generator use the service-role client. RLS does not
  protect them, so they rely on rules 2, 5 and 6 of "Multi-user from day one".

### Tenant isolation tests

The PGlite suites in `db/tests/` (`rls.test.ts`, `tenant-isolation.test.ts`, run by `pnpm test`,
no real database) prove, with users A and B (flag) and C (no flag), for every table found in the
schema:

- A cannot select, update or delete any of B's rows in any table.
- A cannot insert a row with B's `user_id`.
- A cannot insert a child (lap, planned session, set) that references B's activity, report or race
  (the composite foreign key rejects it).
- A client session cannot read `strava_connections` or `strava_webhook_events` at all.
- A signed-in user **without** `app_metadata.roxcoach` (a user of the other app) cannot select or
  insert in any Roxcoach table.
- A cannot move one of its own rows to B by update (`with check`).
- `roxcoach.has_access()` is true only for the JSON boolean `true` in `app_metadata` (not the
  string `"true"`, `null`, an object, or `user_metadata.roxcoach`, which users can write
  themselves).
- Deleting user A removes all of A's rows and none of B's.

## Migrations

| File                         | Content                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `0001_schema_and_enums.sql`  | schema, `schema_migrations`, grants, enums, `set_updated_at()`     |
| `0002_athlete_and_races.sql` | `athlete_profiles`, `availability_slots`, `races`                  |
| `0003_strava.sql`            | `strava_connections`, `strava_webhook_events`                      |
| `0004_training.sql`          | `activities`, `activity_laps`, `station_results`, `strength_sets`  |
| `0005_coach_and_plan.sql`    | `weekly_reports`, `planned_sessions`                               |
| `0006_rls.sql`               | `has_access()`, RLS on every table, policies, service-only revokes |

Isolation is tested by the PGlite suites in `db/tests/`, not by a migration. The access flag and
the initial `athlete_profiles` row are created by hand with `db/seed/grant-access.sql` (see
[auth-security.md](auth-security.md)).
