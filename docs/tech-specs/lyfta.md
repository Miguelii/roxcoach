# Lyfta integration

Lyfta is a read-only source for the athlete's completed gym workouts. The athlete connects a
personal Lyfta API key in Settings and starts each sync manually. Imported workouts become normal
Roxcoach strength activities, so they appear in the calendar, activity detail and coach context.
Each sync the athlete starts runs as a Trigger.dev background task (see
[2026-11-23-background-sync-design.md](2026-11-23-background-sync-design.md)); there is no scheduled
or automatic sync.

## Goals and scope

- Add a Lyfta card to the `Integrations` tab of `/settings`.
- Let the athlete save, replace and disconnect a Lyfta personal API key.
- Validate the key before saving it, then keep it encrypted at rest and server-only.
- Add a manual `Sync workouts` action that imports completed workouts and their sets.
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

`mocks/lyfta_mock.json` holds a real, anonymized `GET /workouts` response (one workout, six
exercises, sets with and without records). Consult it before changing the Lyfta parser or reading a
new field; it shows the exact types, for example numbers as strings (`"15.000"`), empty strings for
missing values, `is_completed` always false for some athletes and comma separated record lists.

Treat the API response as untrusted input. Validate the response envelope and every imported
workout before writing it. Do not log request headers, keys or raw workout payloads.

## Settings UX

Lyfta is a card of the `Integrations` tab of `/settings` (alongside Profile, Dashboard and Goals), above the other integrations (see [zepp.md](zepp.md)). Keep all tab panels
mounted, following the existing Settings tabs behavior.
Disconnect asks first in a confirmation dialog, like deleting a race: a popup on desktop and a
sheet from the bottom on a phone (the shared `Dialog`). "Keep connected" closes it; while the
request runs both buttons are disabled; a failure keeps the dialog open and shows its reason there.

- **Not connected:** explain that the user needs a Lyfta personal API key, provide a password-type
  key input, and a `Connect Lyfta` submit action.
- **Connected:** show a connected state, last successful sync time when available, a `Sync
  workouts` button and a `Disconnect` action. Never display or prefill the saved key.
- **Replace key:** allow submitting a new key through the same validation flow. Do not remove the
  existing connection until the replacement key has been validated and stored successfully.
- **Sync feedback:** the sync runs in the background (see
  [2026-11-23-background-sync-design.md](2026-11-23-background-sync-design.md)). `useLyftaSync`
  starts it, then invalidates `lyfta.getConnectionStatus`. Every `getConnectionStatus` query polls
  every 5 seconds (`SYNC_POLL_INTERVAL_MS`, `pollWhileSyncing` in `src/lib/sync-state.ts`) only while
  `sync.status` is `running`. The button shows a spinner and stays disabled while the stored state is
  `running` (not stale), so a reload keeps the spinner. `useSyncCompletion` remembers the
  `startedAt` the tab saw `running`; when the same run turns `succeeded` or `failed`, the hook
  reports the outcome once and invalidates `training.getCalendar` and `training.getStrengthProgress`.
  A page that loads after the run ended reports nothing. The Settings card toasts that the sync started
  ("Syncing your activities. They will be available shortly."), that one is already running and any
  failure; the result is not toasted, it shows as
  the last run's counts ("Sync complete: 2 workouts added and 1 updated.", or "More workouts to
  sync. Press Sync workouts again to continue." when `hasMore` is true), straight from the status,
  until the athlete starts another sync. The error mapped from the stored code is toasted when the
  card loads, with the same toast id as a fresh failure. Connect, disconnect and clear failures are
  toasts too; nothing is shown inline except field validation. A refused overlap
  ("A Lyfta sync is already running") is not an error: the hook refreshes the status and follows the
  running sync. "Could not start the Lyfta sync. Try again." (`lyfta020`) means the task could not
  be enqueued, and "The Lyfta sync stopped before finishing. Try again." (`lyfta021`) is a run that
  failed without a specific code or went stale. On failure the connection is kept and a retry is
  safe.
- **Dashboard and Calendar:** show a shared action group with `Upload activity` and the shared `Sync`
  button (see [ux-design.md](ux-design.md)), which lists Lyfta as one integration. The sync is
  manual. Its row shows the start toast "Syncing your activities. They will be available shortly.",
  an info toast with the in-progress message on a refused overlap, and, when the run it saw end
  finishes, "Lyfta synced: 120 workouts added and 4 updated." (an info toast with the "More workouts
  to sync" copy when `hasMore` is true) or the mapped error. When
  Lyfta is not connected its row links to Settings to connect.
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
operations may access it, always with the `userId` supplied by the authenticated procedure (or by
the background task payload, which the authenticated start mutation built). The training data
path of a sync uses the service-role client, so its explicit `user_id` filters are the only tenant
guard there. The API key is decrypted
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

Create `strength_sets` rows from each exercise's sets that are completed (`is_completed === true`)
or carry reps or weight. Some accounts log sets with reps and weight but Lyfta never marks them
completed (observed: every set `is_completed: false`), and ignoring those left the imported
workout without exercises. An incomplete set with no reps and no weight, or with malformed values,
is skipped quietly; a completed set with malformed values still fails validation. Set
`exercise_index` from its workout order starting at 1, `source_exercise_id` from `exercise_id`,
`exercise` from `excercise_name`, `exercise_image_url` from `exercise_image`, `set_index` from that
exercise's set order starting at 1, `reps` from the upstream integer reps value, `load_kg` from the
upstream weight converted to kilograms, and `rir` from the upstream non-negative integer. `rpe` is
`NULL`. Store only the image URL, never the image bytes. Accept `kg`, `lb` and `lbs` as
`weight_unit`; convert pounds to kilograms before any weight is written. A non-null weight without
a known unit is invalid, never assume it is kg. Absent optional reps, weight or RIR values map to
`NULL`; malformed non-empty values of a completed set fail validation rather than being silently dropped.
Duration, body weight, total volume, RIR and exercise ID are
retained for progress analysis. Do not use `total_volume` or `totalLiftedWeight` as activity
distance or duration.

Migration `0011_lyfta_progress_metrics.sql` adds the metric columns and source exercise metadata.
It clears existing Lyfta sync checkpoints so the next manual sync fetches all pages and refreshes
previously imported workouts with the new fields. This is a one-time resync (bounded to the last 360 days since the windowed sync) after
deployment; it remains manual and does not create a background job.

Migration `0012_strength_exercise_order.sql` stores each exercise's position in its workout and
clears Lyfta sync checkpoints again. The next manual sync reimports the history with the original
exercise order. Existing manual rows whose order was not stored remain nullable and are grouped by
exercise name.

Migration `0019_strength_set_lyfta_records.sql` adds `strength_sets.lyfta_records` and resets the
sync checkpoints. Lyfta flags the set that broke a personal record with `record_type`,
`record_level` and `record_value` (comma separated lists of the same length, `null` otherwise,
for example `"1,3"`, `"1,1"`, `"20,135"`). Checked against real payloads: type `1` is the
estimated 1RM (Epley, rounded to a whole kg, so 35 kg x 7 gives 43) and type `3` is the volume of
that one set (15 kg x 9 gives 135). Type `2` has not been seen and is stored but not shown.
`record_level` meaning is unknown, so it is stored and never shown. Records are extra information:
a malformed or unknown entry is dropped and never fails validation. The workout payload also
carries `exercise_type`, `set_type_id`, `exercise_rest_time` (always 0 in the samples), `duration`,
`distance` and a `user` object, none of which is imported, and no calories.

Migration `0018_lyfta_resync_incomplete_sets.sql` resets the sync checkpoints once more, so the next
manual sync rebuilds the sets of workouts imported before incomplete sets with reps or weight were
accepted.

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

The `lyfta.syncWorkouts` protected tRPC mutation takes the sync lease and enqueues a Trigger.dev
background task, which runs `syncLyftaWorkouts(userId, startedAt)` without a request session. All Lyfta
network calls stay in the server-side `lyfta` module.

1. Require an existing connection. Decrypt its key on the server.
2. The caller holds the sync lease (below); the sync service does not take or release it. Resolve
   the athlete timezone (`validTimezoneOrUtc`) and create the service-role client once for the
   whole run, not per workout.
3. **Windows.** The sync reads the history in ascending windows of `SYNC_WINDOW_DAYS` (90) UTC
   calendar days with the API's `from` and `to` filters (both ends inclusive), oldest first, each
   window paginated with `limit=100` from page 1 up to the reported `total_pages` (the current page
   and response shape are validated). The start is today (UTC) minus `SYNC_HISTORY_DAYS` (360) when
   there is no checkpoint (the initial import is the last 360 days, older workouts are not
   imported), otherwise the UTC day before `last_synced_at` (one-day overlap for boundary and
   delayed entries) but never earlier than that 360 day floor. The last window ends today (UTC).
   Lyfta does not document a modification-time filter, so edits to workouts older than the window
   are not discovered.
4. **Ceiling, no time budget.** There is no time budget: the background task's `maxDuration`
   bounds the run. A run never fetches more than `MAX_PAGES_PER_SYNC` (200 pages, 20,000
   workouts) in total, a safety ceiling rather than a working limit; reaching it ends the run with
   `hasMore: true`.
   **Stop on disconnect.** Before every window after the first, the connection row is read again.
   When it is gone (disconnect or account deletion during the run) the run ends quietly with the
   totals so far and `hasMore: false`, and writes nothing more.
   **Stop on a lost lease.** The run also ends that way when the row no longer holds its lease
   (`ownsSyncLease`: `running` with `sync_started_at` equal to the payload's `startedAt`, for
   example after the key was replaced), and `updateLyftaLastSyncedAt` only matches that lease, so
   zero rows updated is the same quiet stop rather than an error.
5. **Checkpoint.** `last_synced_at` moves to the end of each fully completed window (the start of
   its last UTC day, so the next run's one-day overlap re-reads that day) and, after the window that
   ends today, to the sync time. It never moves past a window that was not fully processed, so a
   stopped or failed run resumes where it left off. The result carries `hasMore`: true while the
   final window is not completed. The UI then shows "More workouts to sync. Press Sync workouts
   again to continue."; false is a plain success. Each workout upsert is idempotent by source id,
   so overlaps and re-processing are harmless.
6. Write each fetched page in four statements through the `training` service
   (`importLyftaWorkouts`): read which source ids exist (for the created count), upsert all the
   page's activities by `(user_id, source, source_id)` in one statement, delete the imported sets of
   those activities in one statement, and insert all their validated sets (chunks of 1000 rows). Use the service-role client
   and filter each read, update and delete by `user_id` (RLS does not back it up on this path). Keep all orchestration and mapping in the
   application; the database migration contains only schema, indexes, RLS and grants. These
   PostgREST writes are not one transaction. If set replacement fails after the activity upsert or
   old-set deletion, fail the sync and leave the checkpoint unchanged so a retry can repair it.
   Never include locally owned notes or perceived effort in an activity update.
7. If a page or write fails, earlier committed workouts and completed windows remain; a retry is
   safe because each workout upsert is idempotent. Do not report the run as successful or advance
   the checkpoint past the failed window.
8. Return only aggregate created/updated counts, `hasMore` and the checkpoint. Never return the
   API key or raw Lyfta response. The task stores `{ created, updated, hasMore }`
   (`lyftaSyncResultSchema`) in `sync_result`.
9. **Error classification.** `isPermanentLyftaSyncError` marks connection not found,
   configuration, credential (401/403), connection parse, response validation and checkpoint
   errors as permanent: the task writes `failed` with the code and does not retry. Every other
   error (network, timeout, 5xx, 429, database write) is transient and the task retries it.

**Sync lease.** Two overlapping syncs could both delete and insert the sets of a workout and
duplicate them (no unique key, two calls). The lease is `sync_status` with `sync_started_at`
(migration `0021`): `takeLyftaSyncLease` is one compare-and-set update filtered by `user_id` that
succeeds only when `sync_status` is not `running` or `sync_started_at` is older than
`SYNC_LEASE_STALE_MS` (20 minutes, longer than the task's 15 minute `maxDuration`, so a crashed run
frees itself). It sets `running` and the start time and clears `sync_finished_at`, `sync_run_id`,
`sync_result` and `sync_error`. When no row is updated the start fails with
`LyftaSyncInProgressError` (`CONFLICT`, fixed message "A Lyfta sync is already running"). There is
no separate release: `finishLyftaSync` writes `succeeded` (with the result) or `failed` (with the
error code), and it and `setLyftaSyncRunId` only match the row whose `sync_started_at` is this
run's and whose status is still `running`, so a run that outlived its lease never overwrites a
newer one (zero rows matched is not an error).

**Replacing the key.** Saving a different key (the stored one is decrypted and compared) resets
`last_synced_at` to null and the sync state to `idle` (the other sync columns null), so the next sync imports the last 360 days for the new account. Saving
the same key keeps the checkpoint. The key input is at most 512 characters.

**Known limits.** A workout imported from Lyfta and also uploaded as a file is counted twice: there
is no cross-source duplicate guard, so weekly totals and the coach load ratio include both. A Lyfta
workout with an empty duration counts as 0 minutes but 1 session.

Make page requests sequential to respect rate limits. Handle 401 as an invalid/revoked key, 429 as
rate limited, other non-success responses as upstream errors, and transport, timeout, parsing and
database errors explicitly. Do not silently skip malformed workouts. A failed manual sync can be
restarted by the athlete without cleaning up previously imported data.

Disconnect deletes only the user's `lyfta_connections` row. It does not delete imported activities.
The only background job is the sync task the athlete starts. There is no scheduled task, cron
route, webhook, or automatic sync on page load.

## Backend layout

Add `src/_bff/modules/lyfta/` with a router, protected controllers, Effect v4 services, a
`lyfta_connections` repository, Lyfta API client/parser helpers and focused tests. The module owns
connection management, encryption and API calls. Importing activities and sets must go through
the `training` service, not directly into training repositories from the Lyfta module. Keep
cross-module runtime imports on service boundaries.

Add `lyfta` to the root tRPC router. The client exposes connection status and mutations for
connecting/replacing a key, starting a sync and disconnecting. Connection status contains only
`connected`, `lastSyncedAt` and `sync` (`SyncState`: status, `startedAt`, `finishedAt`, the stored
result and error code, with a stale `running` row reported as `failed` with `lyfta021`).
`syncWorkouts` returns `{ startedAt }`.

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
- Verify the 360 day start and clamp, 90 day window arithmetic (month and leap-year boundaries),
  the 200 page ceiling (a 25 page history completes in one run), checkpoint-per-window, resume,
  the stop when the connection disappears, the sync lease repository (compare-and-set filter,
  writes matched to the run's lease), permanent versus transient error classification,
  once-per-run timezone and client, duplicate upsert behavior,
  locally owned notes/RPE preservation and source-set replacement.
- Verify a page/API/database failure does not advance `last_synced_at`, and retrying after partial
  progress does not duplicate activities.
- Verify that authenticated clients cannot access `lyfta_connections`, that its service-role
  repository filters by tenant, and that `source_id` uniqueness is scoped per user.
- Verify disconnect removes credentials but leaves imported activities and sets.
- Verify the Settings tab connects, syncs, reports errors and disables repeated submissions using
  `data-testid` selectors.
- Verify the client: the start toast from the Sync button, polling only while `running`, the final
  toast only after the tab saw the same run `running`, no toast on a page loaded after the run
  ended, the spinner from the status after a remount, and the card showing the stored result or
  error.

## Implementation order

1. Add the migration, environment validation and server-side encryption/API response helpers.
2. Add the Lyfta module and the training-service operation for Lyfta activity upserts and set
   replacement.
3. Add protected tRPC procedures and connect them to the Lyfta Settings tab.
4. Add focused parser, service, repository, tenant-isolation and Settings tests.

## Clear activities

`lyfta.clearActivities` (protected mutation, no input) deletes every activity of the signed-in
athlete with `source = 'lyfta'` and forgets the sync checkpoint (`last_synced_at = null`), so the
next Sync imports them again; the connection and the saved key stay. The strength sets, laps and
station results go with the activities (on delete cascade), and anything the athlete added by hand
to them is lost. Only the last 360 days come back with a Sync: older workouts are gone for good.

The order is fixed: take the sync lease (the same compare-and-set and stale rule as a sync; a sync
that is running makes it fail with `LyftaSyncInProgressError`, "A Lyfta sync is already running", and
nothing is touched), reset the checkpoint, delete, then give the lease back (`idle`). Holding the lease
stops a Sync started in another tab from reading the old checkpoint while the activities go. If the delete fails the checkpoint is already reset, so the next Sync reimports; the other order
could leave the activities gone and a checkpoint that makes the next Sync skip them. The delete runs
through the `training` module (`clearSourceActivities`) with the athlete's own client, filtered by
`user_id` and `source`. It returns `{ deleted }`. `lyfta.getActivityCount` returns `{ count }`, the
number of imported Lyfta activities, for the confirmation dialog and the card. The UI is in
[ux-design.md](ux-design.md). It replaces running `db/seed/clear-lyfta-activities.sql` by hand.
