# Background Sync (Lyfta and Zepp on Trigger.dev) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pressing Sync on Lyfta or Zepp enqueues a Trigger.dev task and returns at once; the task syncs up to 360 days, records its outcome on the connection row, and the client polls that row to show the final toast.

**Architecture:** The tRPC mutations become start services that take a lease on the connection row (`sync_status = 'running'`) and trigger a task with `{ userId, startedAt }`. Each task (`src/trigger/*.task.ts`) runs the existing sync service with a service-role client and writes `succeeded` or `failed` to the row, matched on `startedAt`. `getConnectionStatus` exposes the sync state; the client polls it every 5 s while `running`.

**Tech Stack:** Next.js, tRPC 11, Effect v4, Supabase (schema `roxcoach`), Trigger.dev SDK 4.8.8, TanStack Query, vite-plus tests.

**Spec:** `docs/tech-specs/2026-11-23-background-sync-design.md`

## Global Constraints

- English everywhere, no em-dashes anywhere (code, comments, copy, docs, commit messages).
- `@/` imports only; types at the top of the file; named `type Props`; no narrating comments.
- Every query filters `user_id` and every insert sets it; on the task path RLS does not apply.
- Tokens, API keys and passwords never reach logs, the task payload, `sync_error` or error causes.
- `sync_error` stores an `ErrorCode` value only.
- Lease stale after 20 minutes (`SYNC_LEASE_STALE_MS = 20 * 60 * 1000`); task `maxDuration` 900 s.
- Limits: Lyfta `MAX_PAGES_PER_SYNC = 200`, `SYNC_TIME_BUDGET_MS` removed, `SYNC_HISTORY_DAYS = 360`; Zepp `MAX_DETAILS_PER_SYNC = 1000`, `ZEPP_SYNC_HISTORY_DAYS = 360`, `DETAIL_REQUEST_DELAY_MS = 500` unchanged.
- Start toast copy: "Syncing your activities. They will be available shortly."
- Poll interval 5000 ms, only while `sync.status === 'running'`.
- Tests: `pnpm test` only; fake dependencies, no module mocks; locate by `data-testid` only.
- Each commit passes `pnpm fmt`, `pnpm check`, `pnpm knip` (pre-commit hook). Nothing is pushed.

## Review Focus

1. **Double press or two tabs:** the second start finds the lease taken and gets `*SyncInProgressError`; only one task is triggered. Pinned in Tasks 7 and 8 (start service tests).
2. **A run that outlives its lease:** an old run finishing after a newer run took the lease writes nothing. Pinned in Tasks 4 and 5 (finish repository filters `sync_started_at` and `sync_status = 'running'`).
3. **`onFailure` after a permanent error:** the generic `*_SYNC_FAILED` must not overwrite the specific code already written. Pinned in Task 6 (`runSyncTask` test) and Tasks 4 and 5 (finish only matches `running`).
4. **Reconnect while a sync runs:** reconnecting resets the sync columns, so the old run's final write is a no-op. Pinned in Tasks 4 and 5 (upsert with reset clears the sync columns).
5. **Page opened after the sync ended, or after a stale run:** no toast fires, and a `running` row older than 20 minutes reads as `failed` with `*_SYNC_FAILED`. Pinned in Task 2 (`toSyncState`) and Task 9 (`finishedSync`).

---

### Task 1: Migration for the sync state

**Files:**

- Create: `db/migrations/0021_background_sync.sql`
- Modify: `db/tests/schema.test.ts`, `docs/tech-specs/database.md`

**Interfaces:**

- Produces: enum `roxcoach.sync_status` (`idle`, `running`, `succeeded`, `failed`); on both `roxcoach.lyfta_connections` and `roxcoach.zepp_connections` the columns `sync_status` (not null default `'idle'`), `sync_started_at` timestamptz null (new on Zepp only), `sync_finished_at` timestamptz null, `sync_run_id` text null, `sync_result` jsonb null, `sync_error` text null.

- [ ] **Step 1: Write the failing schema test** in `db/tests/schema.test.ts`, following the file's PGlite helpers: `it('adds the sync state columns to both connection tables')` asserts, for each table, that `information_schema.columns` lists the six columns with the types above and `sync_status` defaults to `'idle'`; `it('keeps the connection tables without policies')` asserts `pg_policies` has no row for either table.
- [ ] **Step 2: Run** `pnpm test db/tests/schema.test.ts`. Expected: FAIL, columns missing.
- [ ] **Step 3: Write the migration.** `begin;` ... `insert into roxcoach.schema_migrations (filename) values ('0021_background_sync.sql'); commit;` like `0020`. Existing Lyfta rows with a non-null `sync_started_at` become `idle` (the old lease is meaningless now): `update roxcoach.lyfta_connections set sync_started_at = null;`.
- [ ] **Step 4: Run** `pnpm test db/tests`. Expected: PASS, including `migrations.test.ts` (numbering, begin/commit).
- [ ] **Step 5: Update `database.md`**: both table column lists, the enum, and the `0021` row of the migration table.
- [ ] **Step 6: Commit** `feat(db): add background sync state to connection tables`.

### Task 2: Shared sync state, errors and codes

**Files:**

- Create: `src/_bff/core/constants/sync.constants.ts`, `src/_bff/core/helpers/sync-state.helper.ts`, `src/_bff/core/helpers/__tests__/sync-state.helper.test.ts`
- Modify: `src/_bff/lib/errors.ts`, `src/_bff/lib/error-codes.ts`, `src/_bff/core/constants/lyfta.constants.ts`, `src/_bff/modules/lyfta/constants/index.ts` (drop `SYNC_LEASE_STALE_MS`)
- Create: `src/_bff/core/constants/zepp.constants.ts`

**Interfaces:**

- Produces, in `sync.constants.ts`: `SYNC_STATUSES = ['idle', 'running', 'succeeded', 'failed'] as const`, `type SyncStatus`, `SYNC_LEASE_STALE_MS = 20 * 60 * 1000`, `SYNC_TASK_MAX_DURATION_S = 900`, `SYNC_START_MESSAGE = 'Syncing your activities. They will be available shortly.'`.
- Produces, in `sync-state.helper.ts`:
    - `type SyncStateRow = { sync_status: string; sync_started_at: string | null; sync_finished_at: string | null; sync_result: unknown; sync_error: string | null }`
    - `type SyncState<R> = { status: SyncStatus; startedAt: string | null; finishedAt: string | null; result: R | null; errorCode: string | null }`
    - `type SyncOutcome<R> = { status: 'succeeded'; result: R } | { status: 'failed'; errorCode: string }`
    - `syncTaskPayloadSchema = z.object({ userId: z.uuid(), startedAt: z.iso.datetime() })`, `type SyncTaskPayload`
    - `toSyncState<R>(row: SyncStateRow | null, resultSchema: z.ZodType<R>, staleErrorCode: string, now: Date): SyncState<R>`
    - `syncIdempotencyKey(provider: 'lyfta' | 'zepp', payload: SyncTaskPayload): string` returning `${provider}:${userId}:${startedAt}`
- Produces errors: `LyftaSyncEnqueueError`, `ZeppSyncInProgressError`, `ZeppSyncEnqueueError` (all `ServiceErrorFields`). Codes: `LYFTA_SYNC_ENQUEUE = 'lyfta020'`, `LYFTA_SYNC_FAILED = 'lyfta021'`, `ZEPP_SYNC_IN_PROGRESS = 'zepp017'`, `ZEPP_SYNC_ENQUEUE = 'zepp018'`, `ZEPP_SYNC_LEASE = 'zepp019'`, `ZEPP_SYNC_FAILED = 'zepp020'`.
- Produces `ZEPP_SYNC_IN_PROGRESS_MESSAGE = 'A Zepp sync is already running'` in `core/constants/zepp.constants.ts` (mirror of the Lyfta one).

- [ ] **Step 1: Write the failing tests** for `toSyncState`:
    - `null` row returns `{ status: 'idle', startedAt: null, finishedAt: null, result: null, errorCode: null }`.
    - a `succeeded` row with a valid result returns it parsed; with an invalid `sync_result` returns `result: null` and status `succeeded`.
    - a `running` row started 19 minutes before `now` stays `running`; started 21 minutes before returns `status: 'failed'`, `errorCode` equal to the passed `staleErrorCode`.
    - an unknown `sync_status` string returns `idle`.
    - `syncIdempotencyKey('zepp', { userId: 'u', startedAt: 't' })` equals `'zepp:u:t'`.
- [ ] **Step 2: Run** `pnpm test src/_bff/core/helpers`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the constants, helper, errors and codes. The helper stays client-importable (no `server-only`).
- [ ] **Step 4: Run** `pnpm test src/_bff/core/helpers`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(sync): add shared background sync state helper and error codes`.

### Task 3: Import without a session

**Files:**

- Modify: `src/_bff/modules/training/services/import-context.service.ts`, `import-lyfta-workout.service.ts`, `import-zepp-activity.service.ts`, `src/_bff/modules/athlete/services/get-athlete-timezone.service.ts`, and their tests under `__tests__/`

**Interfaces:**

- Produces: `createImportContext(userId: string, dependencies?)` where `dependencies = { createClient: () => TrainingClient; getTimezone: (supabase: TrainingClient, userId: string) => Effect<string, ProfileQueryError> }`, default `createDBAdminClient` and `getAthleteTimezoneWithClient`.
- Produces: `getAthleteTimezoneWithClient(supabase: ProfilesClient, userId: string)` in the athlete timezone service (runs `selectTimezone`). `getAthleteTimezone(user)` is unchanged for its existing callers.
- Produces: `importLyftaWorkout(userId: string, workout, context)`, `findKnownZeppTrackIds(userId: string, trackIds, context)`, `findZeppDuplicateTrackIds(userId: string, ...)`, `importZeppActivity(userId: string, ...)`, `findZeppRunsWithoutLaps(userId: string, ...)`, `replaceZeppLaps(userId: string, ...)`: `user: User` becomes `userId: string`, behavior unchanged.

- [ ] **Step 1: Update the tests** of `createImportContext` to call it with a user ID and fake `createClient`/`getTimezone`, asserting `getTimezone` received the created client and the user ID, and an invalid timezone still resolves to `'UTC'`. Update the import service tests to pass `'user-1'` instead of a `User`.
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/training src/_bff/modules/athlete`. Expected: FAIL on the new signatures.
- [ ] **Step 3: Implement** the signature changes. In the two sync services, only change the call sites to pass `user.id` (their own signatures change in Tasks 4 and 5), so this commit typechecks. Audit every repository call the import services make (`activities`, `strength-sets`, `activity-laps`) and confirm each filters `user_id` (or sets it on insert); fix any that does not.
- [ ] **Step 4: Run** `pnpm test src/_bff/modules/training src/_bff/modules/athlete src/_bff/modules/lyfta src/_bff/modules/zepp` and `pnpm check`. Expected: PASS.
- [ ] **Step 5: Commit** `refactor(training): import by user id with the service-role client`.

### Task 4: Lyfta repository and sync service for background runs

**Files:**

- Modify: `src/_bff/modules/lyfta/repositories/lyfta-connections.repository.ts`, `src/_bff/modules/lyfta/types/index.ts`, `src/_bff/modules/lyfta/constants/index.ts`, `src/_bff/modules/lyfta/services/sync-lyfta-workouts.service.ts`, `src/_bff/modules/lyfta/services/__tests__/sync-lyfta-workouts.service.test.ts`
- Create: `src/_bff/modules/lyfta/repositories/__tests__/lyfta-connections.repository.test.ts` (or extend the existing repository test if present), `src/_bff/modules/lyfta/utils/sync-errors.utils.ts`, `src/_bff/modules/lyfta/utils/__tests__/sync-errors.utils.test.ts`
- Modify: `docs/tech-specs/lyfta.md`

**Interfaces:**

- Consumes: Task 2 types, Task 3 `createImportContext(userId)`, `importLyftaWorkout(userId, ...)`.
- Produces (repository):
    - `selectLyftaConnection` also selects the five sync columns; `LyftaConnectionRecord` gains `sync: SyncStateRow`.
    - `takeLyftaSyncLease(supabase, userId, startedAtIso, staleBeforeIso): Effect<boolean>`: one update filtered `.eq('user_id', userId).or('sync_status.neq.running,sync_started_at.lt.<staleBeforeIso>')`, setting `sync_status: 'running'`, `sync_started_at: startedAtIso`, and `null` for `sync_finished_at`, `sync_run_id`, `sync_result`, `sync_error`.
    - `setLyftaSyncRunId(supabase, userId, startedAtIso, runId: string)`
    - `finishLyftaSync(supabase, userId, startedAtIso, outcome: SyncOutcome<LyftaSyncResult>, finishedAtIso)`: filtered by `user_id`, `sync_started_at = startedAtIso` and `sync_status = 'running'`; zero rows is not an error.
    - `upsertLyftaConnection(..., resetCheckpoint = true)` also sets `sync_status: 'idle'` and nulls the other sync columns.
    - `releaseLyftaSyncLease` is deleted.
- Produces (types), in `src/_bff/core/constants/lyfta.constants.ts` so the client shares them: `lyftaSyncResultSchema = z.object({ created: z.number().int(), updated: z.number().int(), hasMore: z.boolean() })` and `type LyftaSyncResult = z.infer<typeof lyftaSyncResultSchema>`.
- Produces (service): `syncLyftaWorkouts(userId: string, dependencies?): Effect<LyftaSyncResult & { lastSyncedAt: string | null }>`. No lease inside. `MAX_PAGES_PER_SYNC = 200`; `SYNC_TIME_BUDGET_MS` and the out-of-time checks are removed. Before each window after the first it calls `selectLyftaConnection`; `null` returns the totals so far with `hasMore: false` and writes nothing more.
- Produces: `isPermanentLyftaSyncError(error: { _tag: string }): boolean`, true for `LyftaConnectionNotFoundError`, `LyftaConfigurationError`, `LyftaCredentialError`, `LyftaConnectionParseError`, `LyftaResponseError`, `LyftaCheckpointError`; false for everything else.

- [ ] **Step 1: Write the failing repository tests** with `src/_bff/lib/fake-admin-db.ts`: `takeLyftaSyncLease` returns `false` when the update returns no row and the recorded filter contains `sync_status.neq.running` and `sync_started_at.lt.<stale>`; `finishLyftaSync` records `.eq('sync_started_at', startedAt)` and `.eq('sync_status', 'running')` and sets `sync_error` to the code for a failed outcome; `upsertLyftaConnection` with reset writes `sync_status: 'idle'` and `sync_started_at: null`.
- [ ] **Step 2: Write the failing service tests**: the sync no longer takes or releases a lease (fake DB queue has no lease rows); a history of 25 pages completes in one run with `hasMore: false`; a connection row that disappears between windows ends the run after the current window with no further `updateLyftaLastSyncedAt`; remove the time-budget tests.
- [ ] **Step 3: Write the failing classifier test**: `isPermanentLyftaSyncError` true for the six tags above, false for `LyftaApiRequestError`, `LyftaRateLimitError`, `LyftaApiError`, `LyftaConnectionWriteError`, `ActivityWriteError`.
- [ ] **Step 4: Run** `pnpm test src/_bff/modules/lyfta`. Expected: FAIL.
- [ ] **Step 5: Implement** the repository, types, constants, service and classifier.
- [ ] **Step 6: Run** `pnpm test src/_bff/modules/lyfta`. Expected: PASS.
- [ ] **Step 7: Update `lyfta.md`**: "Manual sync behavior" (background task, lease on `sync_status`, no time budget, 200-page ceiling, stop on disconnect), "Sync feedback" (start toast, final toast), the lease section (20 minutes).
- [ ] **Step 8: Commit** `feat(lyfta): run the sync without a request session and record its outcome`.

### Task 5: Zepp repository and sync service for background runs

**Files:**

- Modify: `src/_bff/modules/zepp/repositories/zepp-connections.repository.ts`, `src/_bff/modules/zepp/types/index.ts`, `src/_bff/modules/zepp/constants/index.ts`, `src/_bff/modules/zepp/services/sync-zepp-activities.service.ts`, its test
- Create: `src/_bff/modules/zepp/utils/sync-errors.utils.ts` and test
- Modify: `docs/tech-specs/zepp.md`

**Interfaces:**

- Consumes: Task 2 and Task 3 (`userId` signatures).
- Produces (repository, mirror of Task 4): `selectZeppConnection` with `sync: SyncStateRow`; `takeZeppSyncLease(supabase, userId, startedAtIso, staleBeforeIso): Effect<boolean>`; `setZeppSyncRunId(...)`; `finishZeppSync(supabase, userId, startedAtIso, outcome: SyncOutcome<ZeppSyncResult>, finishedAtIso)`; `upsertZeppConnection` resets the sync columns with `last_synced_at`. Write errors use `ZEPP_SYNC_LEASE`.
- Produces: `zeppSyncResultSchema` (four non-negative integers `imported`, `skipped`, `updated`, `remaining`) and `type ZeppSyncResult = z.infer<typeof zeppSyncResultSchema>` in `src/_bff/core/constants/zepp.constants.ts`; the service and `zepp-ui.utils.ts` use this type instead of their local copies.
- Produces (service): `syncZeppActivities(userId: string, dependencies?): Effect<ZeppSyncResult>`. `MAX_DETAILS_PER_SYNC = 1000`. New `ZEPP_SYNC_HISTORY_DAYS = 360`: `runs` keeps only summaries with `Number(trackId) * 1000 >= now - 360 days`, applied before `known`, `fresh` and `unsplit` are computed. Every 25 detail requests it calls `selectZeppConnection`; `null` stops and returns the counts so far without `updateZeppLastSyncedAt`.
- Produces: `isPermanentZeppSyncError(error: { _tag: string }): boolean`, true for `ZeppConnectionNotFoundError`, `ZeppConfigurationError`, `ZeppCredentialError`, `ZeppConnectionParseError`, `ZeppSessionExpiredError`; false otherwise (including `ZeppApiResponseError`, which also covers 5xx).

- [ ] **Step 1: Write the failing repository tests** (same three assertions as Task 4 Step 1, for the Zepp table).
- [ ] **Step 2: Write the failing service tests** with the existing `run(trackId)` builder and a fixed `now`:
    - a run with `trackId` 361 days before `now` is neither imported nor backfilled, and no detail is fetched for it; one 359 days before is imported.
    - 60 new runs are all imported in one call with `remaining: 0`.
    - the connection disappearing at the 25th detail stops the loop: at most 25 imports, no `last_synced_at` write.
- [ ] **Step 3: Write the failing classifier test** for the tags above.
- [ ] **Step 4: Run** `pnpm test src/_bff/modules/zepp`. Expected: FAIL.
- [ ] **Step 5: Implement.**
- [ ] **Step 6: Run** `pnpm test src/_bff/modules/zepp`. Expected: PASS.
- [ ] **Step 7: Update `zepp.md`**: sync section (background task, lease, 360-day filter by `trackid`, 1000 ceiling, stop on disconnect), "Sync button" copy, and the `trackid = end_time - run_time` finding.
- [ ] **Step 8: Commit** `feat(zepp): sync 360 days without a request session and record its outcome`.

### Task 6: Trigger.dev tasks

**Files:**

- Modify: `trigger.config.ts`, `src/env/server.ts`, `.env.example`, `package.json`, `knip.json`, `docs/tech-specs/architecture.md`
- Delete: `src/trigger/example.ts`
- Create: `src/_bff/lib/trigger-client.ts`, `src/trigger/run-sync-task.ts`, `src/trigger/__tests__/run-sync-task.test.ts`, `src/trigger/sync-lyfta-workouts.task.ts`, `src/trigger/sync-zepp-activities.task.ts`, `src/_bff/modules/lyfta/services/finish-lyfta-sync.service.ts`, `src/_bff/modules/zepp/services/finish-zepp-sync.service.ts`

**Interfaces:**

- Consumes: Tasks 2, 4, 5.
- Produces:
    - `ServerEnv.TRIGGER_SECRET_KEY` (`z.string().min(1).optional()`; unset makes the start services fail with the enqueue error).
    - `triggerTask(taskId: string, payload: SyncTaskPayload, idempotencyKey: string): Promise<{ id: string }>` in `trigger-client.ts`: calls `configure({ secretKey })` from `@trigger.dev/sdk` once, then `tasks.trigger(taskId, payload, { idempotencyKey })`; throws when the key is unset.
    - `LYFTA_SYNC_TASK_ID = 'sync-lyfta-workouts'` and `ZEPP_SYNC_TASK_ID = 'sync-zepp-activities'` in each module's `constants/index.ts`.
    - `finishLyftaSyncRun(payload: SyncTaskPayload, outcome: SyncOutcome<LyftaSyncResult>, dependencies?)` and `finishZeppSyncRun(...)`: create the admin client and call the Task 4/5 finish repository with `now()`.
    - `runSyncTask<A, E extends { _tag: string; error_hash: string }>(rawPayload: unknown, deps: { sync: (userId: string) => Effect<A, E>; finish: (payload: SyncTaskPayload, outcome: SyncOutcome<A>) => Effect<void, unknown>; isPermanent: (error: E) => boolean }): Promise<A>`
    - `syncLyftaWorkoutsTask` and `syncZeppActivitiesTask` (`task({ id, maxDuration: SYNC_TASK_MAX_DURATION_S, run, onFailure })`).

`runSyncTask` behavior: invalid payload throws `AbortTaskRunError`; success calls `finish` with `{ status: 'succeeded', result }` and returns the result; a permanent error calls `finish` with `{ status: 'failed', errorCode: error.error_hash }` then throws `AbortTaskRunError(error._tag)`; a transient error throws `new Error(`${error._tag} ${error.error_hash}`)` without calling `finish`; a defect rethrows. The thrown messages never include `cause`. `onFailure` in each task file parses the payload and calls `finish` with `{ status: 'failed', errorCode: *_SYNC_FAILED }`; because finish only matches `running`, it never overwrites a code already written.

- [ ] **Step 1: Write the failing `runSyncTask` tests** with fake `sync`/`finish`: success records one `succeeded` finish; a permanent error records one `failed` finish with its `error_hash` and rejects with an `AbortTaskRunError`; a transient error records no finish and rejects with a plain `Error` whose message has no `cause` text; a payload without `userId` rejects with `AbortTaskRunError` and calls neither fake.
- [ ] **Step 2: Run** `pnpm test src/trigger`. Expected: FAIL.
- [ ] **Step 3: Implement** `runSyncTask`, the finish services, the trigger client and both task files. `trigger.config.ts` gains `build: { conditions: ['react-server'] }`. Add `TRIGGER_SECRET_KEY` to `server.ts`, `.env.example`, and the architecture env table. `knip.json` `entry` gains `trigger.config.ts` and `src/trigger/*.task.ts`. `package.json` scripts: `"trigger:dev": "trigger.dev dev"`, `"trigger:deploy": "trigger.dev deploy"`.
- [ ] **Step 4: Run** `pnpm test src/trigger` and `pnpm check`. Expected: PASS.
- [ ] **Step 5: Build check** `pnpm dlx trigger.dev@4.8.8 deploy --dry-run`. Expected: the bundle builds (no `server-only` or `next/headers` failure). If `src/_bff/core/db/index.ts` breaks it, move `createDBAdminClient` to `src/_bff/core/db/admin.ts` and update its imports.
- [ ] **Step 6: Update `architecture.md`**: a "Background tasks" section (`src/trigger`, thin task files, `runSyncTask`, `react-server` condition, Trigger.dev environment variables: every variable `ServerEnv` requires), the env table, and the local `trigger:dev` / production `trigger:deploy` steps.
- [ ] **Step 7: Commit** `feat(trigger): add the Lyfta and Zepp background sync tasks` (includes the staged Trigger.dev install files).

### Task 7: Lyfta start, controller and status

**Files:**

- Create: `src/_bff/modules/lyfta/services/start-lyfta-sync.service.ts`, its test
- Modify: `src/_bff/modules/lyfta/controllers/sync-workouts.controller.ts`, `src/_bff/modules/lyfta/helpers/controller-errors.ts`, `src/_bff/modules/lyfta/services/lyfta-connection.service.ts`, `src/_bff/modules/lyfta/types/index.ts`, `lyfta-connection.service.test.ts`

**Interfaces:**

- Consumes: Task 4 repository, Task 6 `triggerTask`, `LYFTA_SYNC_TASK_ID`, `syncIdempotencyKey`.
- Produces: `startLyftaSync(userId: string, dependencies?: { createAdminClient; triggerTask: typeof triggerTask; now: () => Date }): Effect<{ startedAt: string }, LyftaConnectionNotFoundError | LyftaSyncInProgressError | LyftaSyncEnqueueError | ...>`.
- Produces: `LyftaConnectionStatus` gains `sync: SyncState<LyftaSyncResult>` (via `toSyncState(row, lyftaSyncResultSchema, ErrorCode.LYFTA_SYNC_FAILED, now)`).
- Produces: `lyfta.syncWorkouts` returns `{ startedAt: string }`; `LyftaSyncEnqueueError` maps to `INTERNAL_SERVER_ERROR`.

- [ ] **Step 1: Write the failing tests**: no connection fails with `LyftaConnectionNotFoundError` and never triggers; lease not taken fails with `LyftaSyncInProgressError` and never triggers; success triggers once with `LYFTA_SYNC_TASK_ID`, payload `{ userId, startedAt }` and key `lyfta:<userId>:<startedAt>`, then stores the run ID; a rejecting `triggerTask` writes a `failed` finish with `LYFTA_SYNC_ENQUEUE` and fails with `LyftaSyncEnqueueError`. Status: a stale running row reports `failed` with `lyfta021`.
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/lyfta`. Expected: FAIL.
- [ ] **Step 3: Implement** the service, controller (thin, exhaustive `Match`) and status change.
- [ ] **Step 4: Run** `pnpm test src/_bff/modules/lyfta` and `pnpm check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(lyfta): start the sync as a background task`.

### Task 8: Zepp start, controller and status

Mirror of Task 7 for Zepp: `startZeppSync(userId, dependencies?)` in `src/_bff/modules/zepp/services/start-zepp-sync.service.ts`, `ZeppSyncInProgressError` (CONFLICT, client message `ZEPP_SYNC_IN_PROGRESS_MESSAGE` through a new `zeppControllerMessage` like the Lyfta one), `ZeppSyncEnqueueError` (INTERNAL_SERVER_ERROR), `ZeppConnectionStatus.sync: SyncState<ZeppSyncResult>` with stale code `ZEPP_SYNC_FAILED`, key `zepp:<userId>:<startedAt>`, task ID `ZEPP_SYNC_TASK_ID`. Same four start tests and the stale status test, then `pnpm test src/_bff/modules/zepp`, `pnpm check`, commit `feat(zepp): start the sync as a background task`.

### Task 9: Client polling, toasts and cards

**Files:**

- Create: `src/lib/sync-state.ts`, `src/lib/__tests__/sync-state.test.ts`, `src/hooks/use-sync-completion.ts`
- Modify: `src/lib/constants.ts`, `src/modules/lyfta/use-lyfta-sync.ts`, `use-sync-lyfta.ts`, `use-lyfta-connection.ts`, `lyfta-card.tsx`, `lyfta-ui.utils.ts`, `src/modules/zepp/use-zepp-sync.ts`, `use-sync-zepp.ts`, `use-zepp-connection.ts`, `zepp-card.tsx`, `zepp-ui.utils.ts`, and their tests in `__tests__/`
- Modify: `docs/tech-specs/ux-design.md` (if it describes sync states), `docs/tech-specs/README.md`

**Interfaces:**

- Consumes: Tasks 7 and 8 (`sync` on both statuses, `{ startedAt }` from the mutations).
- Produces: `SYNC_POLL_INTERVAL_MS = 5000` in `src/lib/constants.ts`.
- Produces in `src/lib/sync-state.ts`:
    - `type SyncSnapshot = { status: SyncStatus; startedAt: string | null }`
    - `pollWhileSyncing(data: { sync: SyncSnapshot } | undefined): number | false` (5000 while `running`).
    - `finishedSync(seenRunningAt: string | null, current: SyncSnapshot): boolean`: true only when `seenRunningAt === current.startedAt` and `current.status` is `succeeded` or `failed`.
- Produces: `useSyncCompletion<R>(sync: SyncState<R> | undefined, onFinished: (sync: SyncState<R>) => void): void` remembers the `startedAt` it saw `running` and calls `onFinished` once per run.
- `useLyftaSync` / `useZeppSync` keep their return shape; `isSyncing` becomes mutation pending or `sync.status === 'running'`; on start they show nothing themselves but call `onStarted?.()`, invalidate `getConnectionStatus`, and on completion call `onSynced(result)` or `onFailed(messageForLyftaError({ message: errorCode }))` (same for Zepp), then invalidate the training queries they invalidate today. All `getConnectionStatus` `useQuery` sites pass `refetchInterval: (query) => pollWhileSyncing(query.state.data)`.
- UI messages added: `LYFTA_SYNC_ENQUEUE`: "Could not start the Lyfta sync. Try again.", `LYFTA_SYNC_FAILED`: "The Lyfta sync stopped before finishing. Try again.", `ZEPP_SYNC_ENQUEUE`: "Could not start the Zepp sync. Try again.", `ZEPP_SYNC_FAILED`: "The Zepp sync stopped before finishing. Try again.", and the Zepp in-progress message passes through like Lyfta's.
- `useSyncLyfta` / `useSyncZepp` show `toast.info(SYNC_START_MESSAGE)` on start, `toast.info(<in-progress message>)` on conflict, and today's success and error toasts on completion.

- [ ] **Step 1: Write the failing pure tests**: `pollWhileSyncing` returns `5000` for `running`, `false` for `idle`, `succeeded`, `failed` and `undefined`; `finishedSync('t1', { status: 'succeeded', startedAt: 't1' })` true, `finishedSync(null, ...)` false, `finishedSync('t1', { status: 'succeeded', startedAt: 't2' })` false, `finishedSync('t1', { status: 'running', startedAt: 't1' })` false.
- [ ] **Step 2: Write the failing hook and card tests** (existing harness, fake tRPC data, test ids only): pressing `sync-source-zepp` shows the start toast; a status sequence `running` then `succeeded` for the same `startedAt` shows "Zepp synced: Imported 2 runs." once and invalidates the calendar; a first render already `succeeded` shows no toast; a `running` status renders the spinner and disables `sync-source-zepp` after a remount; a `failed` status with `zepp009` shows "Your Zepp session expired. Sign in again." in the card. Same set for Lyfta with its copy.
- [ ] **Step 3: Run** `pnpm test src/lib src/modules/lyfta src/modules/zepp src/components`. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** `pnpm test`. Expected: all PASS. Then `pnpm check` and `pnpm knip`.
- [ ] **Step 6: Update docs**: README decisions log ("Data sources" mentions background sync on Trigger.dev) and "Out of scope" (drop "Automatic or background Lyfta sync" and reword "any scheduled job" to "any scheduled job; syncs run in the background only when the athlete presses Sync"); `ux-design.md` sync states if present.
- [ ] **Step 7: Commit** `feat(sync): poll background syncs and toast their outcome`.

### Task 10: End-to-end check

- [ ] **Step 1:** With the user's go-ahead to run servers, start `pnpm trigger:dev` and the Next.js dev server, press Sync on each provider, and confirm: the start toast appears within a second, the row goes `running` then `succeeded`, the final toast appears once, and the calendar shows the imported activities. Then disconnect Zepp mid-sync and confirm the run stops and the row is gone.
- [ ] **Step 2:** Report what could not be checked (production deploy, Trigger.dev environment variables in the dashboard).
