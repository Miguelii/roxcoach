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
    - `0006` revokes every privilege on the service-only table `schema_migrations` from
      `authenticated` and `anon`; `0010` does the same for `lyfta_connections`.

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
5. **Shared extensions.** `pg_cron`, `pg_net` and Vault already serve the whole database. Roxcoach
   runs no database jobs; any it adds must be named with the prefix `roxcoach-`.
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
  `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`.
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
   messages) carries its own `user_id`, so every RLS policy is the same one-liner and no
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
5. **Service-role code does not get RLS.** Jobs and the report generator use the
   service-role client, which bypasses RLS. Every repository function therefore receives `userId`
   as an explicit parameter and filters or inserts with it (see [architecture.md](architecture.md)).
   Nothing may read a table without a `user_id` condition.
6. **Profile row per user.** Today it is inserted by hand. A later `on auth.users insert` trigger
   can create it, with no schema change.

## Enums

| Enum                | Values                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `activity_source`   | `strava`, `manual`, `lyfta`                                                                                         |
| `activity_category` | `run`, `hyrox`, `strength`, `cross`, `other`                                                                        |
| `session_kind`      | `hyrox`, `run`, `strength`, `cross`, `rest`                                                                         |
| `race_type`         | `hyrox`, `running`, `other`                                                                                         |
| `race_priority`     | `A`, `B`, `C`                                                                                                       |
| `race_status`       | `upcoming`, `completed`, `cancelled`                                                                                |
| `hyrox_station`     | `ski_erg`, `sled_push`, `sled_pull`, `burpee_broad_jump`, `rowing`, `farmers_carry`, `sandbag_lunges`, `wall_balls` |

## Tables

### `athlete_profiles`

One row per user (`user_id` is the primary key).

| Column             | Type          | Notes                                                                      |
| ------------------ | ------------- | -------------------------------------------------------------------------- |
| `display_name`     | text          |                                                                            |
| `timezone`         | text not null | default `Europe/Lisbon`                                                    |
| `max_hr`           | int null      |                                                                            |
| `resting_hr`       | int null      |                                                                            |
| `hyrox_division`   | text null     | for example `open_men`, `pro_women`; keys defined in `hyrox.constants.ts`  |
| `weekly_hours_cap` | numeric null  | upper bound the coach must respect                                         |
| `notes`            | text null     | injuries, constraints, preferences                                         |
| `dashboard_mode`   | text not null | `run` (default) or `strength`, check constraint (`0015`); dashboard charts |

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

Save strategy as built: the app upserts the new set on that unique key and then deletes the user's
rows outside it. There is no transaction: a failed delete leaves stale extra slots until the next
save, and two concurrent saves by the same user can race the delete. Every statement filters by
`user_id`.

### `races`

| Column           | Type            | Notes                                                 |
| ---------------- | --------------- | ----------------------------------------------------- |
| `name`           | text not null   | for example `S. Silvestre Guimaraes 10k`              |
| `race_type`      | `race_type`     |                                                       |
| `race_date`      | date not null   |                                                       |
| `location`       | text null       |                                                       |
| `distance_m`     | int null        | required for `running`, null for `hyrox`              |
| `hyrox_division` | text null       | required for `hyrox`                                  |
| `target_time_s`  | int not null    | the goal, for example 4200 for 1h10                   |
| `priority`       | `race_priority` | default `A`. See [athlete-races.md](athlete-races.md) |
| `status`         | `race_status`   | default `upcoming`                                    |
| `result_time_s`  | int null        | filled after the race                                 |
| `notes`          | text null       |                                                       |

Index on `(user_id, race_date)`.

Rules enforced by the app on top of the checks above: a `running` race has a distance (400 to
200000 m), `hyrox` has a division and no distance, `other` has neither, and `running` carries no
division. Blank `location` and `notes` are stored as NULL. `result_time_s` is set only by completing
a race; a completed race cannot be cancelled and a race with a result cannot be deleted.

### `activities`

Every workout, uploaded or entered by hand, or imported from Lyfta. Strava sync was removed
(`0007`).

| Column                       | Type                | Notes                                                                                                                        |
| ---------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `source`                     | `activity_source`   | `manual` or `lyfta` today; the enum still holds `strava` (unused)                                                            |
| `source_id`                  | text null           | Provider workout ID; set for Lyfta imports                                                                                   |
| `category`                   | `activity_category` | chosen or derived when the file is parsed                                                                                    |
| `sport_type`                 | text null           | raw sport type of the source, for example `Run`                                                                              |
| `name`                       | text                |                                                                                                                              |
| `started_at`                 | timestamptz         |                                                                                                                              |
| `local_date`                 | date                | the day in the athlete's timezone, used by the calendar                                                                      |
| `distance_m`                 | numeric null        |                                                                                                                              |
| `moving_time_s`              | int null            |                                                                                                                              |
| `elapsed_time_s`             | int null            |                                                                                                                              |
| `elevation_gain_m`           | numeric null        |                                                                                                                              |
| `avg_hr`                     | numeric null        |                                                                                                                              |
| `max_hr`                     | numeric null        |                                                                                                                              |
| `avg_speed_mps`              | numeric null        |                                                                                                                              |
| `calories`                   | numeric null        |                                                                                                                              |
| `body_weight_kg`             | numeric null        | Lyfta body weight, normalized to kilograms                                                                                   |
| `lyfta_total_volume_kg_reps` | numeric null        | Lyfta volume normalized to kilograms times repetitions                                                                       |
| `perceived_effort`           | smallint null       | RPE 1..10, entered by hand, applies to both sources                                                                          |
| `notes`                      | text null           |                                                                                                                              |
| `deleted_at`                 | timestamptz null    | soft delete                                                                                                                  |
| `hr_histogram`               | jsonb null          | `{"v":1,"bins":[[bpm,time_s,distance_m]]}` (`0015`); null = not computed, empty bins = no heart rate                         |
| `pace_histogram`             | jsonb null          | `{"v":1,"bins":[[pace_s_per_km,time_s,distance_m]]}` (`0016`); null = not computed, empty bins = no usable distance or speed |

Index on `(user_id, local_date)`.
Unique index on `(user_id, source, source_id)` makes provider imports idempotent. PostgreSQL's
default `NULLS DISTINCT` behavior allows any number of rows without a provider ID. Also
`unique (id, user_id)` so children can reference it with a composite key.

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

Unique on `(user_id, activity_id, lap_index)`. Laps of an activity are replaced by deleting
the old rows and then inserting the new ones (not atomic: a failed insert leaves no laps until the
replacement is retried).

### `activity_files`

Original uploaded files (FIT, TCX, GPX). Full contract in [manual-upload.md](manual-upload.md).
`activity_id` is nullable with the composite foreign key `(activity_id, user_id)` to `activities`
(on delete cascade). `format` is checked in `fit`, `tcx`, `gpx`, `status` in `parsed`, `failed`,
and `unique (user_id, sha256)` blocks the same file twice. Standard owner policies apply. The bytes
live in the private Storage bucket `activity-files` (10 MB limit), whose policies on
`storage.objects` allow select, insert and delete only in the caller's own folder with
`roxcoach.has_access()`. The PGlite helper stubs the `storage` schema.

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

| Column               | Type                                           | Notes                                                      |
| -------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `activity_id`        | uuid references `activities` on delete cascade |                                                            |
| `exercise`           | text not null                                  | Display name from Lyfta or manual entry                    |
| `exercise_index`     | int null                                       | Original order within the activity; null for legacy rows   |
| `exercise_image_url` | text null                                      | Optional Lyfta exercise image URL; never image bytes       |
| `source_exercise_id` | text null                                      | Stable ID from the source, used to group progress          |
| `set_index`          | int                                            |                                                            |
| `reps`               | int null                                       |                                                            |
| `load_kg`            | numeric null                                   | Always kilograms for Lyfta imports                         |
| `rir`                | smallint null                                  | Non-negative reps in reserve from Lyfta                    |
| `rpe`                | numeric null                                   | 1..10                                                      |
| `lyfta_records`      | jsonb null                                     | Array of `{ type, level, value }` Lyfta flagged on the set |

Lyfta imports store completed exercise sets here. The Lyfta sync replaces imported set rows when
updating a source workout; see [lyfta.md](lyfta.md). An index on `(user_id, source_exercise_id)`
supports per-exercise progress queries. A second index on `(user_id, activity_id, exercise_index,
set_index)` returns exercise groups and sets in workout order.

### `coach_usage`

One row per athlete and athlete-local day: `user_id` (default `auth.uid()`, cascade), `day` date,
`message_count` int (check `>= 0`), primary key `(user_id, day)`. RLS with the owner policy for
`select`, `insert` and `update` and no `delete` policy (a client can never reset the counter).
`roxcoach.coach_take_message_slot(p_day date, p_cap int) returns boolean` (security invoker, execute
for `authenticated` and `service_role`) takes one slot atomically. See [coach-chat.md](coach-chat.md).

### `lyfta_connections`

One row per user, storing the encrypted personal API key and manual-sync checkpoint. See
[lyfta.md](lyfta.md) for encryption, credential lifecycle and sync behavior.

| Column              | Type             | Notes                                                                                     |
| ------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| `user_id`           | uuid             | primary key; cascades from `auth.users`                                                   |
| `encrypted_api_key` | text not null    | versioned AES-256-GCM ciphertext payload, never plaintext                                 |
| `last_synced_at`    | timestamptz null | end of the last fully completed sync window (see lyfta.md)                                |
| `sync_started_at`   | timestamptz null | when the current or last sync started (`0014`; lease replaced by `sync_status` in `0021`) |
| `sync_status`       | `sync_status`    | not null default `idle`; `idle`, `running`, `succeeded`, `failed` (`0021`)                |
| `sync_finished_at`  | timestamptz null | when the last sync ended (`0021`)                                                         |
| `sync_run_id`       | text null        | background run id of the current or last sync (`0021`)                                    |
| `sync_result`       | jsonb null       | summary of the last successful sync (`0021`)                                              |
| `sync_error`        | text null        | safe error message of the last failed sync (`0021`)                                       |
| `created_at`        | timestamptz      |                                                                                           |
| `updated_at`        | timestamptz      | maintained by `set_updated_at()`                                                          |

### `zepp_connections`

One row per user, storing the encrypted Zepp `app_token` and the time of the last sync. The Zepp
password is never stored. See [zepp.md](zepp.md).

| Column                | Type             | Notes                                                                      |
| --------------------- | ---------------- | -------------------------------------------------------------------------- |
| `user_id`             | uuid             | primary key; cascades from `auth.users`                                    |
| `encrypted_app_token` | text not null    | versioned AES-256-GCM ciphertext payload, never plaintext                  |
| `last_synced_at`      | timestamptz null | end of the last completed sync; cleared when reconnecting                  |
| `sync_status`         | `sync_status`    | not null default `idle`; `idle`, `running`, `succeeded`, `failed` (`0021`) |
| `sync_started_at`     | timestamptz null | when the current or last sync started (`0021`)                             |
| `sync_finished_at`    | timestamptz null | when the last sync ended (`0021`)                                          |
| `sync_run_id`         | text null        | background run id of the current or last sync (`0021`)                     |
| `sync_result`         | jsonb null       | summary of the last successful sync (`0021`)                               |
| `sync_error`          | text null        | safe error message of the last failed sync (`0021`)                        |
| `created_at`          | timestamptz      |                                                                            |
| `updated_at`          | timestamptz      | maintained by `set_updated_at()`                                           |

RLS on, no policies, no privileges for `authenticated` or `anon` (service role only). Zepp
activities are `activities` rows with `source = 'zepp'` and the Zepp track id in `source_id`
(unique with the user and source); they have no `activity_files` row.

### `coach_conversations`

One row per chat with the coach (see [coach-chat.md](coach-chat.md)).

| Column  | Type      | Notes                                  |
| ------- | --------- | -------------------------------------- |
| `title` | text null | null until the first exchange names it |

Index on `(user_id, updated_at desc)`. `unique (id, user_id)` for the composite reference from
`coach_messages`. The `set_updated_at` trigger keeps `updated_at` current.

### `coach_messages`

Append-only: no `updated_at`.

| Column              | Type                                                    | Notes                          |
| ------------------- | ------------------------------------------------------- | ------------------------------ |
| `conversation_id`   | uuid references `coach_conversations` on delete cascade |                                |
| `role`              | text                                                    | check in `user`, `assistant`   |
| `content`           | text                                                    | not null                       |
| `model`             | text null                                               | model id of an assistant reply |
| `prompt_tokens`     | int null                                                |                                |
| `completion_tokens` | int null                                                |                                |

Index on `(conversation_id, created_at)`. Composite foreign key `(conversation_id, user_id)` to
`coach_conversations`. Migration `0009` dropped `weekly_reports`, `planned_sessions` and the enum
types `report_status` and `planned_session_status`.

## Row Level Security

- Every table: `enable row level security`, `schema_migrations` included. Not `force row level
  security`: forcing only affects the table owner (`postgres`), which runs the migrations, the seed
  and the `auth.users` cascades. Clients never connect as the owner and `service_role` bypasses RLS
  through `BYPASSRLS` either way.
- Every table with a client-facing use (all except the service-only tables, including
  `schema_migrations` and `lyfta_connections`): one policy per operation, `select`, `insert`,
  `update` and `delete`, `to authenticated`, with `using (user_id = auth.uid() and
  roxcoach.has_access())` and, for writes, `with check (user_id = auth.uid() and
  roxcoach.has_access())`. The policy is identical on every client-facing table because every
  table, children included, carries `user_id`.
- `roxcoach.has_access()` is a stable SQL function, `security invoker` with `search_path = ''`,
  returning `coalesce(auth.jwt() -> 'app_metadata' -> 'roxcoach' = 'true'::jsonb, false)`. The
  flag is compared as jsonb because `(... ->> 'roxcoach')::boolean` also accepts the strings
  `"true"`, `"t"`, `"yes"`, `"on"` and `"1"` and raises an error for other strings: access is the
  JSON boolean `true` only. Execute is granted to `authenticated` and `service_role`, revoked from
  `public`. `app_metadata` can only be written with the service role, never by the user, so a user
  of the other app cannot grant themselves access and cannot create rows in Roxcoach tables.
- `schema_migrations`: RLS on, **no policies**,
  and no privileges for `authenticated` or `anon` (a client query fails with a permission error).
  Only the service-role client touches them, from server code and jobs. Tokens are never exposed
  to a client session, even if a policy were added by mistake.
- `lyfta_connections` and `zepp_connections`: RLS on, **no policies**, and no privileges for
  `authenticated` or `anon`.
  The service-role repository is the only access path, and every query explicitly filters or
  inserts using the authenticated `userId`. This prevents clients from retrieving even encrypted
  credential material.
- tRPC services use the session-bound client (publishable key), so RLS is a second layer under the
  `user_id` filters in the repositories.
- Jobs and the report generator use the service-role client. RLS does not
  protect them, so they rely on rules 2, 5 and 6 of "Multi-user from day one".

### Tenant isolation tests

The PGlite suites in `db/tests/` (`rls.test.ts`, `tenant-isolation.test.ts`, run by `pnpm test`,
no real database) prove, with users A and B (flag) and C (no flag), for every table found in the
schema:

- A cannot select, update or delete any of B's rows in any table.
- A cannot insert a row with B's `user_id`.
- A cannot insert a child (lap, set, message) that references B's activity or conversation
  (the composite foreign key rejects it).
- A signed-in user **without** `app_metadata.roxcoach` (a user of the other app) cannot select or
  insert in any Roxcoach table.
- A cannot move one of its own rows to B by update (`with check`).
- `roxcoach.has_access()` is true only for the JSON boolean `true` in `app_metadata` (not the
  string `"true"`, `null`, an object, or `user_metadata.roxcoach`, which users can write
  themselves).
- Deleting user A removes all of A's rows and none of B's.

## Migrations

| File                                    | Content                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `0001_schema_and_enums.sql`             | schema, `schema_migrations`, grants, enums, `set_updated_at()`                                              |
| `0002_athlete_and_races.sql`            | `athlete_profiles`, `availability_slots`, `races`                                                           |
| `0003_strava.sql`                       | `strava_connections`, `strava_webhook_events` (dropped by `0007`)                                           |
| `0004_training.sql`                     | `activities`, `activity_laps`, `station_results`, `strength_sets`                                           |
| `0005_coach_and_plan.sql`               | `weekly_reports`, `planned_sessions` (dropped by `0009`)                                                    |
| `0006_rls.sql`                          | `has_access()`, RLS on every table, policies, service-only revokes                                          |
| `0007_remove_strava.sql`                | drops the Strava tables, `webhook_event_status` and `strava_id`                                             |
| `0008_activity_files.sql`               | `activity_files`, private bucket `activity-files` and its policies                                          |
| `0009_coach_chat.sql`                   | `coach_conversations`, `coach_messages`; drops the report and plan tables and enums                         |
| `0010_lyfta.sql`                        | Adds `lyfta` activity source, provider source IDs and `lyfta_connections`                                   |
| `0011_lyfta_progress_metrics.sql`       | Adds Lyfta duration, weight, volume, RIR and source exercise IDs; requests one full manual resync           |
| `0012_strength_exercise_order.sql`      | Stores exercise order for strength sets; requests one full manual Lyfta resync                              |
| `0013_strength_exercise_images.sql`     | Stores optional Lyfta exercise image URLs; requests one full manual Lyfta resync                            |
| `0014_coach_usage.sql`                  | `coach_usage` and `coach_take_message_slot()` (atomic daily coach cap); `lyfta_connections.sync_started_at` |
| `0015_dashboard_progress.sql`           | `athlete_profiles.dashboard_mode`, `activities.hr_histogram`                                                |
| `0016_race_readiness.sql`               | `activities.pace_histogram`                                                                                 |
| `0017_grant_access_fn.sql`              | `roxcoach.grant_access(user_id, display_name)`: sets the flag and creates the profile (service role only)   |
| `0018_lyfta_resync_incomplete_sets.sql` | Requests one full manual Lyfta resync so sets Lyfta never marked completed are imported                     |
| `0019_strength_set_lyfta_records.sql`   | `strength_sets.lyfta_records` (records Lyfta flagged per set); requests one full manual Lyfta resync        |
| `0020_zepp.sql`                         | Adds the `zepp` activity source and `zepp_connections` (service role only)                                  |
| `0021_background_sync.sql`              | Adds the `sync_status` enum and sync state columns to `lyfta_connections` and `zepp_connections`            |

Isolation is tested by the PGlite suites in `db/tests/`, not by a migration. The access flag and
the initial `athlete_profiles` row are written by `roxcoach.grant_access`: automatically by the
`/signup` page for new users ([signup-access-code.md](signup-access-code.md)), or by hand with
`db/seed/grant-access.sql` for an existing account (see [auth-security.md](auth-security.md)).
