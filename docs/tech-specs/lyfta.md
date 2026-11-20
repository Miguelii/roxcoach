# Lyfta integration

Lyfta is a read-only source for the athlete's completed gym workouts. The athlete connects a
personal Lyfta API key in Settings and starts each sync manually. Imported workouts become normal
Roxcoach strength activities, so they appear in the calendar, activity detail and coach context.
There is no scheduled or background sync.

## Goals and scope

- Add a `Lyfta` tab to `/settings`.
- Let the athlete save, replace and disconnect a Lyfta personal API key.
- Validate the key before saving it, then keep it encrypted at rest and server-only.
- Add a manual `Sync workouts` action that imports completed workouts and their completed sets.
- Make repeated syncs idempotent and safe to retry after partial failure.
- Do not write, update or delete data in Lyfta.

Out of scope: OAuth, coach/client access, scheduled jobs, webhook handling, importing programs or
templates, and importing Lyfta workouts into another provider.

## Lyfta API

Use the personal API at `https://my.lyfta.app/api/v1`, not the MCP endpoint or OAuth flow.
The athlete creates a key at `https://my.lyfta.app/community/api`. Send it only from the server as
`Authorization: Bearer <key>`.

| Request                                                        | Purpose                                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET /me`                                                      | Validate a supplied key before saving it. A successful response must be HTTP 200. |
| `GET /workouts?limit=1&page=1`                                 | Validate the response shape before saving a key.                                  |
| `GET /workouts?limit=100&page=N`                               | Fetch workout history and subsequent pages.                                       |
| `GET /workouts?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=100&page=N` | Fetch the incremental date window. Dates are inclusive UTC calendar days.         |

`/workouts` returns `status`, pagination metadata and `workouts`. Each workout has an `id`,
`title`, `workout_perform_date`, `workout_duration`, `weight_unit`, `body_weight`, `total_volume`
and `exercises`. Exercises have `exercise_id`, `excercise_name` (the upstream field is misspelled
and must be read exactly as returned), optional `exercise_image` URL and `sets`; sets include
`weight`, `reps`, `rir`, `is_completed`, and other Lyfta fields. The image field is present in the
sandbox payload but is not documented in OpenAPI. Validate it as an HTTPS URL under
`lyfta.app/images/exercises/` or `apilyfta.com/static/GymvisualPNG/`; a missing or null image is
allowed. Only completed workouts are provided by this endpoint.
The sandbox returns an ISO timestamp with `Z`; the live personal API has been observed to return
`YYYY-MM-DD HH:mm:ss` without an offset. Interpret that observed format as UTC, matching the API's
documented UTC timeline date filtering. Accept explicit ISO offsets and reject other ambiguous or
invalid dates. The API documents `limit` up to 100, `page` starting at 1, 60 requests/minute and
5,000 requests/day.

Treat the API response as untrusted input. Validate the response envelope and every imported
workout before writing it. Do not log request headers, keys or raw workout payloads.

## Settings UX

Add a third `Lyfta` tab alongside Profile and Weekly availability. Keep all tab panels mounted,
following the existing Settings tabs behavior.

- **Not connected:** explain that the user needs a Lyfta personal API key, provide a password-type
  key input, and a `Connect Lyfta` submit action.
- **Connected:** show a connected state, last successful sync time when available, a `Sync
  workouts` button and a `Disconnect` action. Never display or prefill the saved key.
- **Replace key:** allow submitting a new key through the same validation flow. Do not remove the
  existing connection until the replacement key has been validated and stored successfully.
- **Sync feedback:** disable duplicate submissions while connecting or syncing. On success, show
  counts of workouts created and updated, and the sync time. On failure, keep the connection and
  show an actionable error. A retry is safe.
- **Disconnect:** confirm before removing the encrypted key. Keep already imported activities and
  their strength sets; disconnecting must not delete training history.

Show distinct states for invalid/expired credentials, rate limiting, network/API errors, and
database errors. For HTTP 429, tell the athlete to wait before retrying. Do not expose upstream
response bodies or implementation details in the UI.

All UI copy remains English. Use existing Settings tab, form, toast, loading and error patterns.
The API key is sent to a protected server mutation only; it is never placed in a URL, browser
storage, analytics, client query cache, logs or error payloads. Clear the input after successful
connection.

## Data model

See [database.md](database.md) for the canonical schema contract and migration list.

- Add `lyfta` to `activity_source`.
- Add nullable `source_id text` to `activities`, populated with Lyfta's workout `id` for imported
  activities. Add a unique index on `(user_id, source, source_id)`. PostgreSQL's default
  `NULLS DISTINCT` behavior allows multiple activities without a provider ID. This is the
  idempotency key and prevents duplicates across retries.
- Add `lyfta_connections`, one row per user, with an encrypted API key, `last_synced_at` and
  standard `created_at` / `updated_at` timestamps. The table has the standard `user_id` ownership
  and cascade from `auth.users`. Enable RLS with no policies and revoke all privileges from
  `authenticated` and `anon`; only the server-side service-role repository may access it.
- Store no plaintext key and do not return encrypted key material to a client. Encrypt/decrypt in
  server-side Lyfta services with AES-256-GCM and a dedicated, base64-encoded 32-byte
  `NEXT_LYFTA_ENCRYPTION_KEY`. Persist a versioned ciphertext payload with its nonce and
  authentication tag. Validate the environment value when configured; without it, the Lyfta
  connection and sync operations fail explicitly while the rest of the app remains available.
- The encryption key is independent from Supabase keys, is never stored in Supabase, and must be
  backed up and rotated deliberately. Rotation requires decrypting and re-encrypting existing
  connection rows before replacing the old key.

Every repository query filters by `user_id`; inserts set `user_id` explicitly. The
`lyfta_connections` repository uses the service-role client because authenticated clients must
not be able to read encrypted credential material. This table has RLS enabled, no authenticated
policies and no `authenticated` or `anon` table privileges. Only protected Lyfta service
operations may access it, always with the `userId` supplied by the authenticated procedure. The
training data path uses the session-bound client and standard owner RLS. The API key is decrypted
only in the server-side service immediately before an outbound request.

## Import mapping

Create one `activities` row per Lyfta workout:

| Roxcoach field                                             | Mapping                                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------- |
| `source`                                                   | `lyfta`                                                               |
| `source_id`                                                | Lyfta workout `id`, converted to a stable decimal string              |
| `category`                                                 | `strength`                                                            |
| `name`                                                     | Lyfta `title`; use a clear validation error if it is missing or blank |
| `started_at`                                               | Parsed `workout_perform_date`; reject an invalid or ambiguous value   |
| `local_date`                                               | `started_at` converted to the athlete's saved timezone                |
| `elapsed_time_s`                                           | `workout_duration` parsed from `HH:MM:SS` to total seconds            |
| `body_weight_kg`                                           | `body_weight`, converted from `weight_unit` to kilograms              |
| `lyfta_total_volume_kg_reps`                               | `total_volume`, converted to kg x reps                                |
| `sport_type`                                               | `strength`                                                            |
| `distance_m`, moving time, heart-rate and elevation fields | `NULL`                                                                |

Create `strength_sets` rows from each exercise's sets where `is_completed === true`. Set
`exercise_index` from its workout order starting at 1, `source_exercise_id` from `exercise_id`,
`exercise` from `excercise_name`, `exercise_image_url` from `exercise_image`, `set_index` from that
exercise's set order starting at 1, `reps` from the upstream integer reps value, `load_kg` from the
upstream weight converted to kilograms, and `rir` from the upstream non-negative integer. `rpe` is
`NULL`. Store only the image URL, never the image bytes. Accept `kg`, `lb` and `lbs` as
`weight_unit`; convert pounds to kilograms before any weight is written. A non-null weight without
a known unit is invalid, never assume it is kg. Absent optional reps, weight or RIR values map to
`NULL`; malformed non-empty values fail validation rather than being silently dropped. Ignore
incomplete sets intentionally. Duration, body weight, total volume, RIR and exercise ID are
retained for progress analysis. Do not use `total_volume` or `totalLiftedWeight` as activity
distance or duration.

Migration `0011_lyfta_progress_metrics.sql` adds the metric columns and source exercise metadata.
It clears existing Lyfta sync checkpoints so the next manual sync fetches all pages and refreshes
previously imported workouts with the new fields. This is a one-time full-history sync after
deployment; it remains manual and does not create a background job.

Migration `0012_strength_exercise_order.sql` stores each exercise's position in its workout and
clears Lyfta sync checkpoints again. The next manual sync reimports the history with the original
exercise order. Existing manual rows whose order was not stored remain nullable and are grouped by
exercise name.

Migration `0013_strength_exercise_images.sql` adds the optional exercise image URL and resets Lyfta
sync checkpoints. The next manual sync refreshes the imported sets with the image URLs where Lyfta
provides them.

Lyfta owns the imported workout identity, name, date and set rows. Sync updates those source-owned
fields when a known workout is returned, replacing its Lyfta-derived set rows through the
application's training service. Athlete notes and perceived effort remain locally owned and must
be preserved. The activity upsert, set deletion and set insertion are separate PostgREST writes,
not one database transaction. If a write fails partway through, the sync fails without advancing
its checkpoint; retrying the workout upsert and set replacement repairs its imported state.
Imported source fields and sets are read-only in the activity detail UI. `training.getActivity`
returns the imported strength sets, and the coach's `getActivity` tool includes them with the
activity and laps. Calendar and coach queries consume these rows through the existing training
services; do not create a parallel workout model.

## Manual sync behavior

Expose a `lyfta.syncWorkouts` protected tRPC mutation and keep all Lyfta network calls in the
server-side `lyfta` module.

1. Require an existing connection. Decrypt its key on the server.
2. On the first sync, fetch all workout pages with `limit=100`, starting at page 1. Process pages
   sequentially and stop at the API's reported `total_pages` (also validate the current page and
   response shape).
3. After a successful sync, save `last_synced_at`. Later syncs request from the UTC calendar day
   before `last_synced_at` through the current UTC day, inclusive, and paginate the complete result.
   The one-day overlap handles boundary and delayed-entry cases. Lyfta does not document a
   modification-time filter, so edits to workouts older than that window are not guaranteed to be
   discovered by incremental sync.
4. Upsert activities by `(user_id, source, source_id)` through the `training` service, then replace
   that activity's imported sets with the already validated set list. Use the session-bound client
   and filter each read, update and delete by `user_id`. Keep all orchestration and mapping in the
   application; the database migration contains only schema, indexes, RLS and grants. These
   PostgREST writes are not one transaction. If set replacement fails after the activity upsert or
   old-set deletion, fail the sync and leave the checkpoint unchanged so a retry can repair it.
   Never include locally owned notes or perceived effort in an activity update.
5. Advance `last_synced_at` only after every requested page has been fetched and processed. If a
   later page or write fails, earlier successfully committed workouts remain; a retry is safe
   because each workout upsert is idempotent. Do not report the run as successful or advance its
   checkpoint after a partial failure.
6. Return only aggregate created/updated counts and the successful sync timestamp. Never return
   the API key or raw Lyfta response.

Make page requests sequential to respect rate limits. Handle 401 as an invalid/revoked key, 429 as
rate limited, other non-success responses as upstream errors, and transport, timeout, parsing and
database errors explicitly. Do not silently skip malformed workouts. A failed manual sync can be
restarted by the athlete without cleaning up previously imported data.

Disconnect deletes only the user's `lyfta_connections` row. It does not delete imported activities.
There is no scheduled task, cron route, queue, webhook, or automatic sync on page load.

## Backend layout

Add `src/_bff/modules/lyfta/` with a router, protected controllers, Effect v4 services, a
`lyfta_connections` repository, Lyfta API client/parser helpers and focused tests. The module owns
connection management, encryption and API calls. Importing activities and sets must go through
the `training` service, not directly into training repositories from the Lyfta module. Keep
cross-module runtime imports on service boundaries.

Add `lyfta` to the root tRPC router. The client exposes connection status and mutations for
connecting/replacing a key, syncing workouts and disconnecting. Connection status contains only
`connected` and `last_synced_at`.

Add optional server environment variable `NEXT_LYFTA_ENCRYPTION_KEY` to `src/env/server.ts`,
`.env.example`, and the environment table in [architecture.md](architecture.md). Never read
`process.env` outside the env modules.

## Tests

- Validate sandbox and representative workout payloads, including Lyfta's exact
  `excercise_name` field, source exercise order, missing optional values, malformed numeric values,
  invalid dates and incomplete sets.
- Verify key encryption round-trips, rejects tampered ciphertext, and never returns plaintext
  from connection status or repository-facing DTOs.
- Verify connection validation keeps the previous key if a replacement is invalid.
- Verify first-sync pagination, incremental UTC date bounds, overlap, duplicate upsert behavior,
  locally owned notes/RPE preservation and source-set replacement.
- Verify a page/API/database failure does not advance `last_synced_at`, and retrying after partial
  progress does not duplicate activities.
- Verify that authenticated clients cannot access `lyfta_connections`, that its service-role
  repository filters by tenant, and that `source_id` uniqueness is scoped per user.
- Verify disconnect removes credentials but leaves imported activities and sets.
- Verify the Settings tab connects, syncs, reports errors and disables repeated submissions using
  `data-testid` selectors.

## Implementation order

1. Add the migration, environment validation and server-side encryption/API response helpers.
2. Add the Lyfta module and the training-service operation for Lyfta activity upserts and set
   replacement.
3. Add protected tRPC procedures and connect them to the Lyfta Settings tab.
4. Add focused parser, service, repository, tenant-isolation and Settings tests.
