# Background sync for Lyfta and Zepp (Trigger.dev)

## Intent

Today pressing Sync on Lyfta or Zepp runs the whole import inside the tRPC request, and the athlete
waits on a spinner until it ends. The limits that keep the request under the route timeout (40 s
and 20 pages for Lyfta, 50 details for Zepp) also mean a long history needs several presses ("Press
Sync again to continue").

The goal is that pressing Sync answers at once with a toast, "Syncing your activities. They will be
available shortly.", and the import runs as a Trigger.dev background task. Freed from the request
timeout, one press syncs the whole window (360 days for both providers). The app still notices
when the sync ends: a final toast with the counts or the error, and the calendar refreshes.

## Goals

- Sync returns immediately for Lyfta and Zepp; the work runs in a Trigger.dev task.
- One sync covers up to 360 days of history for both providers, without the per-request budgets.
- The sync state lives in the database: the spinner survives a reload or another tab, and a sync
  already running refuses a second one (for Zepp too, which has no lease today).
- When the sync ends, the tab that is open shows a success or error toast and refreshes the
  training queries.
- A dead or stuck run never blocks the Sync button forever.

## Non-goals and anti-goals

- No scheduled or automatic sync. The athlete still starts every sync.
- No push or email notification when a sync ends.
- No other providers and no other background jobs in this change.
- Anti-goal: a background run reading or writing another athlete's rows. Without a session the
  service-role client bypasses RLS, so the explicit `user_id` filter on every query is the only
  guard and must hold everywhere the task reaches.
- Anti-goal: tokens, API keys or passwords in the task payload, Trigger.dev logs or the stored
  error. The payload carries only the user ID and the lease timestamp.
- Anti-goal: an error the athlete never sees. A failed sync always reaches the UI as `failed`.

## Constraints

- Trigger.dev v4 (`@trigger.dev/sdk` 4.8.8) is installed. `trigger.config.ts` scans each module's `tasks/` folder,
  runtime `node-24`, `maxDuration` 3600 s, 3 attempts by default.
- The task runs outside Next.js: no request, no cookies, no `next/headers`. `createDBServerClient`
  cannot be called from it.
- 72 files under `src/_bff` import `server-only`, which throws outside the `react-server` export
  condition.
- `ServerEnv` validates every required server variable at import, so the Trigger.dev environment
  needs them all (not only the ones the task uses).
- `lyfta_connections` and `zepp_connections` are service-role only (RLS on, no policies).
- Lyfta's windowed sync already moves its checkpoint at the end of each completed 90-day window, so
  a retried run resumes. Zepp's sync is idempotent (known track IDs are skipped).

## Approaches considered

How the open tab learns that the background sync ended:

| Approach                      | Trade-off                                                                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Fire and forget            | Simplest: only the start toast. Errors (expired Zepp token, revoked Lyfta key) are invisible to the athlete, and nothing refreshes the calendar                                                                |
| **B. Status in the database** | The connection row stores the sync state; the client polls `getConnectionStatus` every 5 s while it is `running`. Survives reloads and tabs, doubles as the lease, no new dependency. Up to 5 s of extra delay |
| C. Trigger.dev Realtime       | Instant updates through `@trigger.dev/react-hooks` and a public access token per run. New dependency and token, and the state is lost on reload unless the run ID is stored anyway                             |

**Chosen: B.** Errors reach the athlete, the state survives reloads, the same column replaces the
Lyfta lease and gives Zepp one, and the polling costs one light query every 5 s only while a sync
runs. A few seconds of delay do not matter for a sync that lasts seconds to minutes.

## Design

### Flow

1. The athlete presses Sync (shared Sync button or Settings card).
2. `lyfta.syncWorkouts` / `zepp.syncActivities` (protected mutations, same names as today) call a
   new start service, which:
    1. reads the connection (not found: `*ConnectionNotFoundError`, as today);
    2. takes the lease with one compare-and-set update (below). Not taken: `*SyncInProgressError`;
    3. triggers the provider task with `{ userId, startedAt }` and stores the run ID (a failed run
       ID write is ignored: the task is already enqueued and the ID only helps support);
    4. if triggering fails, marks the row `failed` with the enqueue error code and fails the
       mutation.
3. The mutation returns `{ startedAt }`. The client shows the start toast and the row is
   `running`.
4. The task runs the sync, then writes `succeeded` with the result counts, or `failed` with the
   error code.
5. The client, polling while `running`, sees the change, shows the final toast and invalidates the
   training queries.

### Sync state (migration `0021_background_sync.sql`)

New enum `roxcoach.sync_status`: `idle`, `running`, `succeeded`, `failed`. Both connection tables
get the same columns:

| Column             | Type                                    | Purpose                                                                        |
| ------------------ | --------------------------------------- | ------------------------------------------------------------------------------ |
| `sync_status`      | `roxcoach.sync_status` default `'idle'` | state of the last sync                                                         |
| `sync_started_at`  | timestamptz null                        | lease and start time (already on `lyfta_connections` from `0014`; add to Zepp) |
| `sync_finished_at` | timestamptz null                        | end of the last run                                                            |
| `sync_run_id`      | text null                               | Trigger.dev run ID, for support and the dashboard                              |
| `sync_result`      | jsonb null                              | provider counts of the last successful run (shape below)                       |
| `sync_error`       | text null                               | `ErrorCode` of the last failed run, never a message or cause                   |

`last_synced_at` keeps its meaning (Lyfta checkpoint, Zepp last completed sync). Reconnecting a
provider resets the sync columns to `idle` as well as `last_synced_at`.

### Lease

Taking it is one update, `where user_id = $1 and (sync_status <> 'running' or sync_started_at <
$staleBefore)`, setting `running`, `sync_started_at = now`, and clearing `sync_finished_at`,
`sync_error`, `sync_result` and `sync_run_id`. Zero rows updated means a sync is running.

- `SYNC_LEASE_STALE_MS` becomes 20 minutes for both providers, and both tasks set `maxDuration` to
  15 minutes, so a lease only goes stale after its run can no longer be alive.
- Every write the task makes to the row (`succeeded`, `failed`, run ID) matches `sync_started_at =
  startedAt` from the payload, so an old run that outlived its lease never overwrites a newer one.
- The run checks it still owns the lease: at every connection re-read (before each Lyfta window,
  every 25 Zepp details) the row must be `running` with `sync_started_at` equal to the payload's
  `startedAt` (compared as instants, since the payload is `...Z` and the database returns
  `...+00:00`), and the `last_synced_at` checkpoint update matches the same lease. A run that lost
  its lease (key or token replaced, disconnect, taken over after going stale) stops quietly with the
  totals so far and writes nothing more; it is not a failure and is not retried.
- The task does not release the lease separately: writing `succeeded` or `failed` is the release.
- The client treats `running` older than the stale threshold as not running (button enabled).

### Tasks

One file per task in its module's `tasks/` folder: `src/_bff/modules/lyfta/tasks/sync-lyfta-workouts.task.ts` and
`src/_bff/modules/zepp/tasks/sync-zepp-activities.task.ts` (task IDs `sync-lyfta-workouts`, `sync-zepp-activities`). Each is a
thin binding, like a controller: a zod-validated payload `{ userId: uuid, startedAt: ISO string }`,
then the service, then the outcome. No business logic and no Supabase calls in the task file.

- The task runs the existing sync service and maps its result:
    - success: `succeeded` with `sync_result`;
    - a **permanent** error (connection gone, decrypt or configuration failure, Lyfta 401/403, Zepp
      session expired, schema validation of a response): `failed` with its code, then
      `AbortTaskRunError` so Trigger.dev does not retry;
    - a **transient** error (network, timeout, 5xx, 429, database write): thrown so Trigger.dev
      retries (3 attempts, config defaults). The row stays `running` between attempts.
- The task's `onFailure` hook writes `failed` with a generic code when the attempts run out or the
  run dies (`maxDuration` exceeded, crash). The stale lease is the last safety net if even that
  write fails. An invalid payload returns early, and a failed write throws only `<tag> <code>`.
- `queue: { concurrencyLimit }` per task keyed by `userId` is not needed: the lease already
  serializes one athlete's syncs. The trigger call uses `idempotencyKey: <provider>:<userId>:<startedAt>`
  so a retried mutation never enqueues the same lease twice.

### Services without a session

The sync services move from `user: User` to `userId: string` and never touch cookies:

- `createImportContext(userId)` creates the service-role client (`createDBAdminClient`) instead of
  `createDBServerClient`, and resolves the timezone through it. `getAthleteTimezone` gets a variant
  (or a client parameter) that reads with the passed client.
- Every training repository the import reaches already filters and inserts `user_id`; the builder
  verifies each one on the task path (`import-lyfta-workout`, `import-zepp-activity`, strength sets,
  laps, duplicate lookups) because RLS no longer backs it up.
- `import 'server-only'` is handled with `build.conditions: ['react-server']` in
  `trigger.config.ts`, so the existing imports resolve to the no-op export inside the Trigger.dev
  build. Removing `server-only` from 72 files is not part of this change. `next/headers` must not
  be called on the task path; if importing `src/_bff/core/db/index.ts` breaks the Trigger.dev
  build, move `createDBAdminClient` to its own file under `core/db/`.
- The tasks configure nothing from `process.env` directly: they read `ServerEnv`.

### Limits

| Constant                            | Today         | Background                                                                                  |
| ----------------------------------- | ------------- | ------------------------------------------------------------------------------------------- |
| Lyfta `SYNC_TIME_BUDGET_MS`         | 40 s          | removed (the task's `maxDuration` bounds the run)                                           |
| Lyfta `MAX_PAGES_PER_SYNC`          | 20            | 200 (20,000 workouts): a safety ceiling, not a working limit                                |
| Lyfta `SYNC_HISTORY_DAYS`           | 360           | 360 (unchanged)                                                                             |
| Zepp `MAX_DETAILS_PER_SYNC`         | 50            | 1,000 (about 8 minutes at the 500 ms spacing): a safety ceiling                             |
| Zepp `ZEPP_SYNC_HISTORY_DAYS` (new) | none          | 360: only runs with `Number(trackid) >= now - 360 days` are imported or get laps backfilled |
| `SYNC_LEASE_STALE_MS`               | 5 min (Lyfta) | 20 min, shared by both providers                                                            |

The Zepp `trackid` is the run start in Unix seconds (`end_time - run_time = trackid` in the mock).
The filter applies before any detail is requested, so older runs cost no API calls. Runs already
imported that are older than 360 days stay untouched; a run older than 360 days without laps is no
longer backfilled.

`hasMore` (Lyfta) and `remaining` (Zepp) stay in the result, so a run that hits a safety ceiling
still says so; in practice they are `false` and `0`.

### Result shape (`sync_result`)

- Lyfta: `{ created, updated, hasMore }`.
- Zepp: `{ imported, skipped, updated, remaining }`.

Validated with zod when read; an invalid stored value is treated as no result (the toast falls back
to "Lyfta synced." / "Zepp synced.").

### API

- Mutations: `lyfta.syncWorkouts` and `zepp.syncActivities` keep their names and now return
  `{ startedAt: string }`. Errors: connection not found, sync in progress, enqueue failure, and the
  existing configuration errors.
- `lyfta.getConnectionStatus` and `zepp.getConnectionStatus` add
  `sync: { status, startedAt, finishedAt, result, errorCode }` (with `status` already corrected for
  a stale lease to `failed`, and `errorCode` the stored code).

### Client

- `useLyftaSync` and `useZeppSync` (used by both the Sync button sources and the Settings cards)
  change from "await the mutation and show the result" to:
    1. call the mutation, show the info toast "Syncing your activities. They will be available
       shortly." (on `SyncInProgress`, an info toast with the provider's in-progress message, "A Lyfta
       sync is already running" or "A Zepp sync is already running", and keep polling);
    2. invalidate `getConnectionStatus`, which now polls with `refetchInterval: 5000` while
       `sync.status === 'running'`, and stops otherwise;
    3. when this tab saw `running` and the status turns `succeeded` or `failed` for the same
       `startedAt`, show the final toast and invalidate `training.getCalendar`,
       `training.getRunProgress` and the other training queries the sync affects today.
- `isSyncing` comes from `sync.status === 'running'` (not stale), not from the mutation's pending
  state, so a reload keeps the spinner.
- A page that loads after the sync ended shows no toast. The Settings cards show the last result
  or error from the status.
- Final toasts reuse today's copy: "Lyfta synced: 120 workouts added and 4 updated.", "Zepp synced:
  Imported 2 runs." (and the laps variant). Errors map the stored `ErrorCode` to the same messages
  the mutation errors map to today, so `lyfta-ui.utils.ts` and `zepp-ui.utils.ts` gain a
  code-to-message lookup.
- The "Press Sync again to continue" messages only show when `hasMore` / `remaining` say so.

### Disconnect and account deletion during a sync

The sync re-reads the connection row between Lyfta windows and every 25 Zepp details; if it is gone
the run stops quietly (no retry, nothing written). Account deletion removes the rows, so the same
check ends the run, and any write after that fails without retry.

### Environment

- Next.js: `TRIGGER_SECRET_KEY` in `src/env/server.ts`, passed to the SDK with `configure()` from
  the start service (never read from `process.env` elsewhere). Added to `.env.example` and the
  architecture env table.
- Trigger.dev project (dev and prod): every variable `ServerEnv` requires, in practice
  `NEXT_SUPABASE_URL`, `NEXT_SUPABASE_PUBLISHABLE_KEY`, `NEXT_SUPABASE_SERVICE_ROLE_KEY` and
  `NEXT_LYFTA_ENCRYPTION_KEY`. Set in the Trigger.dev dashboard (or with the `syncEnvVars` build
  extension, the builder's choice), documented in `architecture.md`.

### Operations

- Local development runs `pnpm dlx trigger.dev@latest dev` next to the Next.js dev server; without
  it, a sync stays `running` until the lease goes stale.
- Production needs the tasks deployed with `pnpm dlx trigger.dev@latest deploy` whenever the sync
  code changes, alongside the Vercel deploy. A `package.json` script for both commands is added.

### Errors

New tags and codes in `src/_bff/lib/errors.ts` / `error-codes.ts`: `ZeppSyncInProgressError`, an
enqueue error per provider (`LYFTA_SYNC_ENQUEUE`, `ZEPP_SYNC_ENQUEUE`), a sync state write error per
provider, and a generic `*_SYNC_FAILED` code for `onFailure`. Controller `Match` maps stay
exhaustive.

### Tests

- Start services with a fake Supabase client and a fake trigger function (dependency, not a module
  mock): lease taken and not taken, stale lease retaken, enqueue failure marks `failed`.
- Sync services: the new limits, the Zepp 360-day filter, the stop when the connection disappears,
  permanent versus transient error classification.
- Status services: stale `running` reported as `failed`, invalid `sync_result` ignored.
- Hooks and cards: start toast, polling only while `running`, final toast only after this tab saw
  `running`, spinner from the status. Test ids only.
- `db/tests`: the migration adds the enum and columns, and the connection tables keep no policies.

### Specs to update in the same change

`lyfta.md` (manual sync behavior, budget and ceiling, UI feedback), `zepp.md` (sync, limits, Sync
button), `database.md` (columns, enum, migration table), `architecture.md` (background tasks
layer, module `tasks/` folders, env table), `ux-design.md` if it describes the sync states, and the README
decisions log and "Out of scope" list ("Automatic or background Lyfta sync", "any scheduled job"),
which this change partly reverses.

## Left to the builder

- Exact error class names and codes, following the existing pattern.
- Whether the task files wrap Effect with a small `runTask` helper or `Effect.runPromise` plus a
  `Match` on the error tag.
- `syncEnvVars` extension or dashboard variables for the Trigger.dev environment.
- Whether `createDBAdminClient` needs its own file (only if the Trigger.dev build requires it).
