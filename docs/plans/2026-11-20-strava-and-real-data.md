# Strava and Real Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the athlete's Strava account (OAuth, token refresh, webhook, sync, backfill), store activities and laps, and replace the whole mock data layer so the dashboard, calendar and activity pages show real data.

**Architecture:** `strava` module (API client, token service, sync services, webhook handling, Trigger.dev jobs, OAuth) writes through the `training` module (activities and laps). The UI reads through `training` tRPC controllers. Every repository takes `supabase` then `userId`; token and webhook paths use the service-role client. Heavy work runs in Trigger.dev jobs, the webhook only records the event and enqueues.

**Tech Stack:** Next.js 16 (`cacheComponents`), Effect v4, tRPC 11, Supabase (schema `roxcoach`), `@trigger.dev/sdk` v4, zod 4, Vitest via `vp test`.

**Spec:** `docs/tech-specs/strava.md` (binding), plus `docs/tech-specs/database.md` (tables `strava_connections`, `strava_webhook_events`, `activities`, `activity_laps`), `docs/tech-specs/architecture.md`, `docs/tech-specs/auth-security.md`, `docs/tech-specs/ux-design.md`. The specs win over this plan; Task 10 updates the spec text for the decisions below.

This is plan 2 of the series. Later plans: 3 athlete profile, availability and races; 4 manual logging; 5 coach weekly report, plan and cron.

## Global Constraints

- All code, identifiers, comments and UI copy in English. No em-dashes anywhere. pnpm only. `@/` imports under `src/`, never relative. Types at the top of the file. Component props use a named `type Props`. Class merging uses `cn()`. Semantic color tokens only. shadcn on base-ui.
- Services are `Effect.fn('name')` on Effect v4 (`Effect.catch`, `Effect.tryPromise`, `return yield*`; no try/catch inside `Effect.gen`). Errors are `Data.TaggedError` in `src/_bff/lib/errors.ts` with `cause: unknown` and `error_hash: ErrorCode` (codes in `error-codes.ts`, distinct 8-character lowercase alphanumeric values). Controllers: one file per route exporting exactly one `<NAME>_PROTECTED_CONTROLLER` with an exhaustive `Match.tag` map; use `runEffect` with a `clientMessage` mapper only when a constant client message is required.
- Every repository function takes `supabase: SupabaseClient` then `userId: string` and filters or inserts with `user_id` explicitly. The one exception is `findConnectionByStravaAthleteId` (webhook owner lookup, service role).
- Strava tokens (access and refresh), the client secret, the webhook verify token and `NEXT_CRON_SECRET` never appear in logs, errors, tRPC responses, test snapshots or URLs. The Logger already redacts by key name; do not put a token inside a message string.
- Secrets and verify tokens are compared in constant time (`crypto.timingSafeEqual` on equal-length buffers).
- The webhook route always answers within 2 seconds and never does heavy work inline: validate, record the event, enqueue, return `200`.
- No real Strava or Trigger.dev account is contacted in this plan: tests mock `fetch` and `@trigger.dev/sdk`. No real Supabase is touched. No secrets in the repo.
- Every element used in tests carries a `data-testid`; tests locate by test id only. Pages use `PageProps<'/route'>`; data-fetching pages and components render inside `Suspense` (the app uses `cacheComponents`).
- Every commit passes the pre-commit hook (`pnpm fmt`, `pnpm check`, `pnpm knip`; knip treats test files as usage and route files as entries). Run `pnpm test` first. End every commit message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Nothing is pushed.
- If `CLAUDE.md` shows as modified in `git status` and you did not change it, do not commit it: `git stash push -- CLAUDE.md` before the commit and `git stash pop` after.

## Rulings Taken While Planning (spec follows these; Task 10 edits the spec)

- Laps are replaced with delete then insert, not a database transaction (PostgREST has no transactions). The sync is idempotent and retried, so a failure between the two leaves an activity without laps until the retry.
- `local_date` is the instant `start_date` converted to the athlete's profile timezone (`athlete_profiles.timezone`, default `Europe/Lisbon` when the profile row is missing), not `start_date_local`.
- Strava `404` on an activity fetch means "deleted or private": the local activity is soft-deleted.
- The OAuth callback route is outside the session proxy (matcher excludes `api/`), so it verifies the session and the access flag itself.
- The webhook enqueue failing does not fail the request: the event is marked `failed` and "Sync now" recovers it.
- The calendar only produces `activity` items now. Planned-session and race chips return with plans 3 and 5.

## Review Focus

1. Webhook abuse: wrong or missing verify token, a `POST` for an unknown `owner_id`, a redelivered event, a forged event for another user's activity. Unknown owners must be ignored without leaking whether the athlete exists, and nothing may be written for them.
2. OAuth: state cookie missing or mismatched, a callback hit without a session or without the access flag, a user who grants fewer scopes than `activity:read_all`, a user who denies access, a code replay.
3. Token handling: refresh races (two jobs refreshing at once must not lose the rotated refresh token), refresh failure, a revoked token (401 after refresh), tokens never reaching the client or logs.
4. Sync correctness: an activity updated twice, deleted on Strava, with zero laps, with a null heart rate, with a timezone near midnight (local date differs from UTC date), rate limit (429) and Strava 5xx.
5. Mock removal: no import of anything mock remains, pages degrade to honest empty or "coming soon" states, and the calendar and stats are correct for an athlete with no activities.

---

### Task 1: Foundations (env, Trigger.dev setup, constants, errors, API client)

**Files:**

- Create: `src/_bff/modules/strava/constants/index.ts`, `src/_bff/modules/strava/helpers/strava-api.client.ts`, `trigger.config.ts`
- Modify: `src/env/server.ts`, `.env.example`, `src/_bff/lib/errors.ts`, `src/_bff/lib/error-codes.ts`, `package.json`, `knip.json`
- Test: `src/_bff/modules/strava/helpers/__tests__/strava-api.client.test.ts`

**Interfaces:**

- Produces: constant `STRAVA_API_BASE` (`https://www.strava.com/api/v3`) (other constants are added by the task that first uses them, so knip stays clean); error classes `StravaUnauthorizedError` (401 or 403), `StravaNotFoundError` (404), `StravaRateLimitedError` (429, extra field `retryAfterS: number | null`), `StravaApiError` (anything else, extra field `status: number | null`); `stravaApiGet<T>(path: string, accessToken: string, schema: z.ZodType<T>, query?: Record<string, string | number>): Effect<T, StravaUnauthorizedError | StravaNotFoundError | StravaRateLimitedError | StravaApiError>`; `stravaOAuthPost<T>(url: string, body: Record<string, string>, schema: z.ZodType<T>): Effect<T, StravaUnauthorizedError | StravaRateLimitedError | StravaApiError>` (form-encoded POST used for token exchange, refresh and deauthorize).

- [ ] **Step 1: Write the failing tests** (mock global `fetch`): `stravaApiGet` sends `Authorization: Bearer <token>` to `STRAVA_API_BASE + path` with the query string and returns the zod-parsed body; status 401 and 403 give `StravaUnauthorizedError`, 404 `StravaNotFoundError`, 429 `StravaRateLimitedError` with `retryAfterS` parsed from `Retry-After` (null when absent), 500 `StravaApiError` with `status: 500`; a network rejection and a body that fails the schema both give `StravaApiError`; the access token never appears in any error's `cause` or in `JSON.stringify` of the failure. `stravaOAuthPost` sends `application/x-www-form-urlencoded` and maps the same statuses.
- [ ] **Step 2: Run** `pnpm test strava-api.client` and confirm failure.
- [ ] **Step 3: Install** `@trigger.dev/sdk` (same major as BrewStock, 4.x) with pnpm. Add scripts `trigger:dev` and `trigger:deploy` (`pnpm dlx trigger.dev@latest dev|deploy`, as in BrewStock).
- [ ] **Step 4: Implement** the files above. In `src/env/server.ts` add optional `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF`, and set `emptyStringAsUndefined: true` on the `createEnv` call (an empty value copied from `.env.example` must read as unset). `trigger.config.ts` follows BrewStock's with `project` read from `process.env.TRIGGER_PROJECT_REF`, `dirs: ['./src/_bff/modules/strava/jobs']` (create an empty `.gitkeep` there if the directory is needed), `runtime: 'node-24'`. Update `.env.example` with `TRIGGER_PROJECT_REF`. Add `trigger.config.ts` and `src/_bff/modules/*/jobs/*.job.ts` to `knip.json` `entry` (jobs are loaded by Trigger.dev, not imported), and remove any entry this task makes unnecessary.
- [ ] **Step 5: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 6: Commit** `feat: strava foundations, api client and trigger config`.

### Task 2: Mapping and Hyrox station detection (pure helpers)

**Files:**

- Create: `src/_bff/modules/strava/helpers/strava-schemas.helper.ts`, `map-strava-activity.helper.ts`, `detect-hyrox-stations.helper.ts`
- Test: `src/_bff/modules/strava/helpers/__tests__/map-strava-activity.helper.test.ts`, `detect-hyrox-stations.helper.test.ts`

**Interfaces:**

- Consumes: `HyroxStation`, `HYROX_STATIONS`, `HYROX_STATION_LABELS` from `@/_bff/core/constants/hyrox.constants`.
- Produces: zod schemas and types `StravaActivity` (fields used by the spec mapping: `id`, `name`, `sport_type`, `start_date`, `distance`, `moving_time`, `elapsed_time`, `total_elevation_gain`, optional `average_heartrate`, `max_heartrate`, `average_speed`, `calories`), and `StravaLap` (`lap_index`, optional `name`, `distance`, `elapsed_time`, `moving_time`, optional `average_heartrate`, `average_speed`); `type ActivityCategory = 'run' | 'hyrox' | 'strength' | 'cross' | 'other'`; `mapStravaCategory(sportType: string, hasStations: boolean): ActivityCategory`; `mapStravaActivity(activity: StravaActivity, timezone: string): ActivityRow` where `ActivityRow` holds `strava_id`, `source: 'strava'`, `category`, `sport_type`, `name`, `started_at` (ISO string), `local_date` (`YYYY-MM-DD` of `start_date` in `timezone`), `distance_m`, `moving_time_s`, `elapsed_time_s`, `elevation_gain_m`, `avg_hr`, `max_hr`, `avg_speed_mps`, `calories` (missing values `null`, never `0` or `'N/A'`) and category computed with `hasStations = false` (the sync service recomputes it after detection); `mapStravaLaps(laps: StravaLap[], stations: Array<HyroxStation | null>): LapRow[]` with `lap_index`, `name`, `distance_m`, `elapsed_time_s`, `moving_time_s`, `avg_hr`, `avg_speed_mps`, `station`; `detectHyroxStations(laps: Array<{ name?: string | null }>): Array<HyroxStation | null>` (same length as the input).

- [ ] **Step 1: Write the failing tests.** Category table from `docs/tech-specs/strava.md` ("Mapping"): `Run`, `TrailRun`, `VirtualRun` give `run`; `WeightTraining`, `Crossfit` give `strength`; `Workout` and `HighIntensityIntervalTraining` give `hyrox` when `hasStations` else `cross`; `Rowing`, `Ride`, `Swim`, `Walk`, `Hike`, `Elliptical` give `cross`; an unknown value gives `other`. Mapping: every column from a full fixture; missing optional values become `null`; `local_date` near midnight (`start_date` `2026-06-30T23:30:00Z` in `Europe/Lisbon` is `2026-07-01`, in winter `2026-12-31T23:30:00Z` stays `2026-12-31`; also a negative-offset timezone such as `America/Sao_Paulo`). Detection: exactly 16 laps give run and station alternating (indexes 0,2,4,... are `null`, indexes 1,3,5,... are the 8 stations in race order); a lap list where names contain recognisable station names (case-insensitive: `skierg`, `ski erg`, `sled push`, `sled pull`, `burpee`, `row`, `farmers`, `lunge`, `wall ball`) tags those laps and leaves the others `null`; 15 laps, 17 laps, 0 laps, and a plain 10 x 1 km run give all `null` (conservative: a wrong tag is worse than none). Laps mapping carries the station tags through.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement** the helpers. Use `Intl.DateTimeFormat` with `en-CA` and the timezone for the local date. Keep exports minimal (knip).
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: strava activity mapping and hyrox station detection`.

### Task 3: Connection storage and token service

**Files:**

- Create: `src/_bff/modules/strava/repositories/strava-connections.repository.ts`, `src/_bff/modules/strava/services/get-valid-access-token.service.ts`
- Modify: `src/_bff/lib/errors.ts`, `src/_bff/lib/error-codes.ts`, `src/_bff/modules/strava/constants/index.ts`, `src/_bff/modules/strava/helpers/strava-schemas.helper.ts`
- Test: `src/_bff/modules/strava/repositories/__tests__/strava-connections.repository.test.ts`, `src/_bff/modules/strava/services/__tests__/get-valid-access-token.service.test.ts`

**Interfaces:**

- Consumes: Task 1 client, errors and constants; `createDBAdminClient`.
- Produces: constants `STRAVA_TOKEN_URL` (`https://www.strava.com/oauth/token`) and `TOKEN_REFRESH_MARGIN_S = 600`; schema and type `StravaTokenResponse` (`access_token`, `refresh_token`, `expires_at` as epoch seconds, optional `athlete: { id: number }`); error classes `StravaNotConfiguredError` (client id or secret unset), `StravaNotConnectedError` and `StravaConnectionError` (repository failures); an internal helper reading `NEXT_STRAVA_CLIENT_ID` and `NEXT_STRAVA_CLIENT_SECRET` from `ServerEnv` and failing with `StravaNotConfiguredError` when either is unset; type `StravaConnection = { user_id: string; strava_athlete_id: number; access_token: string; refresh_token: string; expires_at: string; scope: string; connected_at: string | null; last_synced_at: string | null }`; repository functions (each `Effect.fn`, each takes `supabase, userId` first except the owner lookup): `selectConnection(supabase, userId): Effect<StravaConnection | null, StravaConnectionError>`, `upsertConnection(supabase, userId, input: { strava_athlete_id: number; access_token: string; refresh_token: string; expires_at: string; scope: string }): Effect<void, StravaConnectionError>`, `deleteConnection(supabase, userId): Effect<void, StravaConnectionError>`, `updateTokensIfRefreshTokenMatches(supabase, userId, previousRefreshToken: string, tokens: { access_token: string; refresh_token: string; expires_at: string }): Effect<boolean, StravaConnectionError>` (compare-and-swap: the `update` is conditioned on the stored `refresh_token`; returns whether a row changed), `touchLastSyncedAt(supabase, userId, at: string): Effect<void, StravaConnectionError>`, `findConnectionByStravaAthleteId(supabase, stravaAthleteId: number): Effect<{ user_id: string } | null, StravaConnectionError>`; service `getValidAccessToken(userId: string): Effect<string, StravaNotConnectedError | StravaNotConfiguredError | StravaUnauthorizedError | StravaRateLimitedError | StravaApiError | StravaConnectionError | CreateSbClientError>` (creates its own admin client, returns the stored access token while `expires_at` is more than `TOKEN_REFRESH_MARGIN_S` away, otherwise refreshes with `grant_type=refresh_token`, saves the new tokens BEFORE returning the new access token).

- [ ] **Step 1: Write the failing tests.** Repository (fake client as in other repository tests): every function filters or inserts with `user_id`; both the thrown error and the returned `error` field map to `StravaConnectionError`; `updateTokensIfRefreshTokenMatches` applies the refresh-token condition and returns `false` when no row changed. Service: a fresh token is returned with no HTTP call; a token expiring inside the margin triggers one refresh, saves tokens (new `refresh_token` and `expires_at` converted from epoch seconds to ISO) and returns the new access token; when the compare-and-swap returns `false` (another job refreshed first) the service re-reads the connection and returns the stored token without a second refresh call; a missing connection fails `StravaNotConnectedError`; a 401 from the refresh fails `StravaUnauthorizedError` and leaves the stored row untouched; no token ever appears in a failure value.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement.** Follow the repository rules in `docs/tech-specs/architecture.md`. Convert `expires_at` seconds to an ISO timestamp.
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: strava connection storage and token refresh`.

### Task 4: Training data layer (activities, laps, calendar queries)

**Files:**

- Create: `src/_bff/modules/training/types/index.ts`, `repositories/activities.repository.ts`, `repositories/activity-laps.repository.ts`, `services/upsert-activity-from-strava.service.ts`, `services/soft-delete-strava-activity.service.ts`, `services/get-calendar.service.ts`, `services/get-activity.service.ts`, `controllers/get-calendar.controller.ts`, `controllers/get-activity.controller.ts`, `training.router.ts`, `src/_bff/trpc/caller.ts`
- Modify: `src/_bff/trpc/router.ts` (add `training: TRAINING_ROUTER`), `src/_bff/lib/errors.ts`, `src/_bff/lib/error-codes.ts`, `docs/tech-specs/architecture.md` (re-add `caller.ts`)
- Test: repositories, services and controllers under `__tests__`

**Interfaces:**

- Consumes: Task 2 `ActivityRow`, `LapRow`.
- Produces: error classes `ActivityQueryError`, `ActivityWriteError`; types `ActivityDTO` (`id`, `source`, `stravaId: number | null`, `category`, `name`, `startedAt`, `localDate`, `distanceM`, `movingTimeS`, `elapsedTimeS`, `elevationGainM`, `avgHr`, `maxHr`, `avgSpeedMps`, `calories`, `perceivedEffort`, `notes`, all optional values `number | string | null`), `LapDTO` (`lapIndex`, `name`, `distanceM`, `elapsedTimeS`, `movingTimeS`, `avgHr`, `avgSpeedMps`, `station: HyroxStation | null`), `CalendarItem = { type: 'activity'; date: string; activity: ActivityDTO }`; repository functions (`supabase, userId` first): `upsertStravaActivity(supabase, userId, row: ActivityRow): Effect<string, ActivityWriteError>` (returns the activity id; upsert on `(user_id, strava_id)`; clears `deleted_at`), `softDeleteByStravaId(supabase, userId, stravaId: number): Effect<void, ActivityWriteError>`, `selectActivitiesInRange(supabase, userId, from: string, to: string): Effect<ActivityDTO[], ActivityQueryError>` (by `local_date`, excludes soft-deleted, ordered by `started_at`), `selectActivityById(supabase, userId, id: string): Effect<ActivityDTO | null, ActivityQueryError>`, `replaceLaps(supabase, userId, activityId: string, laps: LapRow[]): Effect<void, ActivityWriteError>` (delete then insert, empty list only deletes), `selectLaps(supabase, userId, activityId: string): Effect<LapDTO[], ActivityQueryError>`, `countStravaActivities(supabase, userId): Effect<number, ActivityQueryError>`; services `upsertActivityFromStrava(supabase, userId, row, laps)` (upsert, replace laps, returns activity id), `softDeleteStravaActivity(supabase, userId, stravaId)`, `getCalendar(user: User, range: { from: string; to: string })` (validates `from <= to` and a span of at most 100 days), `getActivity(user: User, id: string)` (activity plus laps, `null` when missing); controllers `GET_CALENDAR_PROTECTED_CONTROLLER` (input `{ from, to }` as `YYYY-MM-DD` strings, query) and `GET_ACTIVITY_PROTECTED_CONTROLLER` (input `{ id: z.uuid() }`, query); `TRAINING_ROUTER = router({ getCalendar, getActivity })`; `createCaller(): Promise<...>` from `@/_bff/trpc/caller` (server-only, builds context then `appRouter.createCaller`).

- [ ] **Step 1: Write the failing tests.** Repositories: filters by `user_id` and by range, soft-deleted rows excluded, DTO camelCase mapping with `null` preserved, error mapping for both the thrown and the returned error. `replaceLaps`: deletes the activity's laps for that user and inserts the new ones with `user_id` and `activity_id`; with an empty list it only deletes. Services: `upsertActivityFromStrava` calls upsert then replaceLaps with the returned id; `getCalendar` rejects an inverted or over-long range with a typed failure the controller maps to `BAD_REQUEST`; `getActivity` returns `null` for a missing id. Controllers: input validation (bad date string, non-uuid id) and error mapping through `appRouter.createCaller` with the service mocked. `caller.ts`: `createCaller()` returns a caller exposing the `training` namespace (mock the context).
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement** following `docs/tech-specs/architecture.md` layering. Calendar dates are plain `YYYY-MM-DD` strings; do not convert through `Date` in the repository.
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: training module with activities, laps and calendar queries`.

### Task 5: Sync services and webhook event handling

**Files:**

- Create: `src/_bff/modules/athlete/repositories/athlete-profiles.repository.ts`, `src/_bff/modules/strava/repositories/strava-webhook-events.repository.ts`, `services/sync-strava-activity.service.ts`, `services/sync-missing-activities.service.ts`, `services/handle-strava-webhook-event.service.ts`
- Modify: `src/_bff/lib/errors.ts`, `src/_bff/lib/error-codes.ts`
- Test: one test file per new unit under `__tests__`

**Interfaces:**

- Consumes: Tasks 1 to 4.
- Produces: `selectTimezone(supabase, userId): Effect<string, ProfileQueryError>` (returns `'Europe/Lisbon'` when no profile row); webhook repository `insertEventIfNew(supabase, input: { user_id: string | null; owner_id: number; object_type: string; object_id: number; aspect_type: string; event_time: string }): Effect<{ id: string; isNew: boolean }, WebhookEventError>` (the unique key makes a redelivery return `isNew: false`), `markEventStatus(supabase, id: string, status: 'processed' | 'ignored' | 'failed', error?: string): Effect<void, WebhookEventError>`; `syncStravaActivity(userId: string, stravaActivityId: number): Effect<{ activityId: string } | { deleted: true }, ...>` (admin client, `getValidAccessToken`, fetch the activity and `/activities/{id}/laps`, map, detect stations, recompute the category with `hasStations`, `upsertActivityFromStrava`; a Strava `404` soft-deletes the local activity and returns `{ deleted: true }`; `StravaRateLimitedError` and 5xx propagate so the job retries); `syncMissingActivities(userId: string, options: { afterEpochS: number | null }): Effect<{ synced: number }, ...>` (pages `GET /athlete/activities?per_page=100&page=N` with `after` when given, syncs each activity, waits `SYNC_ITEM_DELAY_MS` (constant, 250) between activities, stops and propagates on `StravaRateLimitedError`, then `touchLastSyncedAt`); `handleStravaWebhookEvent(event: { object_type: string; object_id: number; aspect_type: string; owner_id: number; event_time: number; updates?: Record<string, string> }): Effect<WebhookDecision, ...>` with `WebhookDecision = { action: 'ignore' } | { action: 'sync'; userId: string; stravaActivityId: number; eventId: string } | { action: 'verify_deauthorization'; userId: string; eventId: string }` (RULING after review: the webhook POST is unsigned, so destructive events are never executed inline: an `activity` `delete` returns `sync` (the sync job's Strava 404 confirms the deletion and soft-deletes), an `athlete` update with `authorized: 'false'` returns `verify_deauthorization`); `verifyStravaDeauthorization(userId: string): Effect<{ disconnected: boolean }, ...>` (calls `getValidAccessToken` then `GET /athlete`; deletes the connection ONLY when Strava confirms the grant is gone: a 401 from `GET /athlete` (a 403 does not count) or a refresh rejected with 400 (a refresh 401 or 403 means misconfiguration or a restriction and does not count); any other outcome leaves the connection and propagates).
- Error classes added: `ProfileQueryError`, `WebhookEventError`.

- [ ] **Step 1: Write the failing tests.** `syncStravaActivity`: full happy path with a 16-lap fixture (activity row has category `hyrox` for a `Workout`, laps carry stations), a plain run (category `run`, no station), zero laps, null heart rate, a 404 on the activity soft-deletes and returns `{ deleted: true }`, a 429 propagates as `StravaRateLimitedError`, the profile timezone is used for `local_date`. `syncMissingActivities`: pagination stops at an empty page, `after` is sent when given, a 429 mid-way propagates after the already synced items were kept, `last_synced_at` is touched on success only. `handleStravaWebhookEvent`: unknown `owner_id` gives `{ action: 'ignore' }` and writes no event row for a user (it may record an `ignored` audit row with `user_id: null`); a duplicate event (`isNew: false`) gives `ignore`; `activity` `create` and `update` give `sync`; `activity` `delete` gives `sync` and changes nothing (the sync job's 404 confirms the deletion); `athlete` `update` with `updates.authorized === 'false'` gives `verify_deauthorization` and deletes nothing inline; any other `athlete` update is ignored; an unknown `object_type` is ignored. No token appears in any failure.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement.** Event time is epoch seconds: store as ISO. Services create their own admin client (`createDBAdminClient`) because they run in jobs and in the webhook route without a user session.
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: strava sync services and webhook event handling`.

### Task 6: Trigger.dev jobs and enqueue services

**Files:**

- Create: `src/_bff/modules/strava/jobs/sync-strava-activity.job.ts`, `backfill-strava.job.ts`, `sync-missing-strava.job.ts`, `src/_bff/modules/strava/services/enqueue-strava-jobs.service.ts`
- Modify: `src/_bff/lib/errors.ts`, `src/_bff/lib/error-codes.ts`
- Test: `src/_bff/modules/strava/services/__tests__/enqueue-strava-jobs.service.test.ts`, `src/_bff/modules/strava/jobs/__tests__/jobs.test.ts`

**Interfaces:**

- Consumes: Task 5 services; `@trigger.dev/sdk`.
- Produces: job ids `verify-strava-deauthorization` (payload `{ userId: string; eventId: string | null }`, runs `verifyStravaDeauthorization`, marks the event `processed`), `sync-strava-activity` (payload `{ userId: string; stravaActivityId: number; eventId: string | null }`), `backfill-strava` (payload `{ userId: string }`, syncs the last 12 months), `sync-missing-strava` (payload `{ userId: string }`, syncs since the connection's `last_synced_at`); error class `EnqueueStravaJobError`; `enqueueSyncActivity(payload): Effect<void, EnqueueStravaJobError>`, `enqueueVerifyDeauthorization(payload: { userId: string; eventId: string | null }): Effect<void, EnqueueStravaJobError>`, `enqueueBackfill(userId: string): Effect<void, EnqueueStravaJobError>`, `enqueueSyncMissing(userId: string): Effect<void, EnqueueStravaJobError>`. Enqueue uses `tasks.trigger` with an `idempotencyKey` (`<userId>:<stravaActivityId>` for activity syncs (debounce: forged events with fresh `event_time` values must not multiply Strava calls; use a short idempotency TTL such as 5 minutes if the SDK supports it), `<userId>:backfill` for backfill, a per-minute key for sync-missing) and fails with `EnqueueStravaJobError` when `TRIGGER_SECRET_KEY` is unset, instead of calling the SDK.

- [ ] **Step 1: Write the failing tests** (mock `@trigger.dev/sdk` and the services): each enqueue function calls `tasks.trigger` with the right id, payload and idempotency key; a missing `TRIGGER_SECRET_KEY` fails without calling the SDK; an SDK rejection maps to `EnqueueStravaJobError` with the cause not containing the secret. Job tests: each job's `run` calls the matching service with the payload and rethrows service failures so Trigger retries; `sync-strava-activity` configures retries (at least 3 attempts, exponential backoff) and treats `StravaUnauthorizedError` as non-retryable; when the payload has an `eventId`, success marks the event `processed` and a final failure marks it `failed` with a safe message (never the cause object).
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement** following BrewStock's `process-report.job.ts` (`task`, `Effect.runPromise`). Set `maxDuration` generously for backfill (it pages and throttles). Every job file is listed through `trigger.config.ts` `dirs` (Task 1).
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: strava trigger jobs and enqueue services`.

### Task 7: OAuth connection, status, disconnect, sync now

**Files:**

- Create: `src/_bff/modules/strava/services/start-strava-connect.service.ts`, `complete-strava-connect.service.ts`, `disconnect-strava.service.ts`, `get-strava-status.service.ts`, `sync-now.service.ts`, controllers `get-connect-url.controller.ts`, `get-status.controller.ts`, `disconnect.controller.ts`, `sync-now.controller.ts`, `src/_bff/modules/strava/strava.router.ts`, `src/app/api/strava/callback/route.ts`
- Modify: `src/_bff/trpc/router.ts` (`strava: STRAVA_ROUTER`), `src/_bff/lib/errors.ts`, `src/_bff/lib/error-codes.ts`
- Test: services, controllers and the route under `__tests__`

**Interfaces:**

- Consumes: Tasks 1, 3, 4 and 6.
- Produces: constants `STRAVA_AUTHORIZE_URL` (`https://www.strava.com/oauth/authorize`), `STRAVA_DEAUTHORIZE_URL` (`https://www.strava.com/oauth/deauthorize`), `STRAVA_SCOPE = 'read,activity:read_all'`, `STRAVA_REQUIRED_SCOPE = 'activity:read_all'` (add them to the constants file); `startStravaConnect(userId: string): Effect<{ url: string }, ...>` (random 32-byte hex `state`, sets an httpOnly, `sameSite: 'lax'`, `secure` in production, `path: '/api/strava'`, `maxAge: 600` cookie `strava_oauth_state` through `next/headers`, returns `https://www.strava.com/oauth/authorize?client_id=...&response_type=code&redirect_uri=<NEXT_PUBLIC_WEBSITE_URL>/api/strava/callback&approval_prompt=auto&scope=read,activity:read_all&state=<state>`); `completeStravaConnect(input: { userId: string; code: string | null; scope: string | null; state: string | null; error: string | null; stateCookie: string | null }): Effect<'connected' | 'denied' | 'scope', ...>` (constant-time state check against the cookie, `denied` when `error` is set or the code is missing, `scope` when the granted scope does not include `activity:read_all` (nothing stored), otherwise exchange the code, `upsertConnection`, `enqueueBackfill`, return `'connected'`; an enqueue failure does not undo the connection); `disconnectStrava(userId)` (best-effort deauthorize call, never fails the disconnect, then `deleteConnection`; activities are kept); `getStravaStatus(userId): Effect<{ connected: boolean; athleteId: number | null; connectedAt: string | null; lastSyncedAt: string | null; activityCount: number }, ...>` (never returns tokens); `syncNow(userId)` (requires a connection, enqueues `sync-missing-strava`); controllers `GET_CONNECT_URL_PROTECTED_CONTROLLER` (mutation), `GET_STATUS_PROTECTED_CONTROLLER` (query), `DISCONNECT_PROTECTED_CONTROLLER` (mutation), `SYNC_NOW_PROTECTED_CONTROLLER` (mutation); `STRAVA_ROUTER = router({ getConnectUrl, getStatus, disconnect, syncNow })`; `GET /api/strava/callback` route handler.

- [ ] **Step 1: Write the failing tests.** Services: the authorize URL has every parameter and the state matches the cookie set; `completeStravaConnect` table: state mismatch, missing state, missing cookie, `error=access_denied`, missing code, granted scope `read` only, success (tokens saved, `strava_athlete_id` from the token response, backfill enqueued once), code replay (Strava answers 400, mapped to a typed failure, nothing stored), enqueue failure still connects; `getStravaStatus` contains no key named `access_token`, `refresh_token` or `scope`; `disconnectStrava` completes even when the deauthorize call fails. Route: no session gives a redirect to `/login`; a session without `app_metadata.roxcoach` gives a redirect to `/login` and nothing is exchanged; each outcome redirects to `/settings?strava=connected|denied|scope|error`; the state cookie is cleared in every case. Controllers map the typed errors exhaustively (`StravaNotConfiguredError` to `PRECONDITION_FAILED`, `StravaNotConnectedError` to `PRECONDITION_FAILED`).
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement.** The route reads the session through `createDBServerClient` and `getUser()`, checks `hasRoxcoachAccess`, reads the cookie with `cookies()`, and delegates to `completeStravaConnect`. Redirect targets use `ClientEnv.NEXT_PUBLIC_WEBSITE_URL` (consume it here: fix `src/env/client.ts` to read `process.env.NEXT_PUBLIC_WEBSITE_URL` literally, drop its `knip.json` ignore).
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: strava oauth connection, status, disconnect and sync now`.

### Task 8: Webhook route and subscription script

**Files:**

- Create: `src/app/api/strava/webhook/route.ts`, `tools/strava-subscription.ts`, `src/_bff/modules/strava/helpers/webhook-payload.helper.ts`
- Test: `src/app/api/strava/webhook/__tests__/route.test.ts`, `src/_bff/modules/strava/helpers/__tests__/webhook-payload.helper.test.ts`

**Interfaces:**

- Consumes: Tasks 5 and 6.
- Produces: `parseWebhookPayload(body: unknown): { ok: true; event: StravaWebhookEvent } | { ok: false }` (zod, rejects missing or mistyped fields); `GET /api/strava/webhook` (`hub.mode`, `hub.verify_token`, `hub.challenge`: equal tokens in constant time give `200` with JSON `{ "hub.challenge": <value> }`, anything else gives `403`); `POST /api/strava/webhook` (always `200` with an empty JSON body unless the request body is not JSON, which gives `400`; parses, calls `handleStravaWebhookEvent`, enqueues a sync for the `sync` decision, never throws to the client, an enqueue failure marks the event `failed`); `tools/strava-subscription.ts` (a runnable script, executed with `pnpm dlx tsx tools/strava-subscription.ts <create|view|delete> [id]`, reading `NEXT_STRAVA_CLIENT_ID`, `NEXT_STRAVA_CLIENT_SECRET`, `NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN` and `NEXT_PUBLIC_WEBSITE_URL` from the environment, calling `POST|GET|DELETE https://www.strava.com/api/v3/push_subscriptions`, printing the subscription id and never printing the secret).

- [ ] **Step 1: Write the failing tests.** Route `GET`: right token returns the challenge JSON, wrong token, missing token, wrong mode and an unset `NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN` all return `403`, an empty token never matches an unset one. Route `POST`: ids are validated as positive safe integers; a valid `activity` `create` or `delete` for a known owner enqueues exactly one sync, an `athlete` update with `authorized: 'false'` enqueues exactly one verification job and never deletes anything itself, and the route returns `200` quickly (the handler awaits nothing slow beyond the enqueue); an unknown owner returns `200` and enqueues nothing; a duplicate returns `200` and enqueues nothing; invalid JSON returns `400`; an invalid but JSON body returns `200` and does nothing; a service failure still returns `200`; the response body never contains user ids or event details. Payload helper: valid and invalid shapes.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement.** The script is plain TypeScript with no `server-only` imports (it is not part of the Next build); exclude `tools/` from knip entries only if needed and keep lint clean. Document the three commands in a comment at the top of the script. Add `tools/strava-subscription.ts` to `knip.json` `entry`.
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: strava webhook route and subscription script`.

### Task 9: Remove the mocks, real dashboard, calendar and activity pages

**Files:**

- Delete: `src/modules/mock/` (all), `src/modules/coach/`, `src/modules/plan/`, `src/modules/races/`, `src/modules/settings/availability-editor.tsx`, `src/modules/activity/activity-details-dialog.tsx`, `src/modules/calendar/log-session-dialog.tsx`, `src/modules/calendar/use-log-session-form.ts`, `src/modules/dashboard/next-up.tsx`, `src/modules/dashboard/latest-report.tsx`, `src/modules/settings/settings-view.tsx`
- Create: `src/components/coming-soon.tsx`, `src/_bff/core/utils/date.utils.ts` (`todayIn(timezone: string, now?: Date): string`), `src/_bff/modules/athlete/services/get-athlete-timezone.service.ts` (`getAthleteTimezone(user: User): Effect<string, ...>` over `selectTimezone`), `src/_bff/modules/athlete/controllers/get-timezone.controller.ts` (`GET_TIMEZONE_PROTECTED_CONTROLLER`, query), `src/_bff/modules/athlete/athlete.router.ts` (`ATHLETE_ROUTER = router({ getTimezone })`)
- Modify: `src/_bff/trpc/router.ts` (`athlete: ATHLETE_ROUTER`), `src/modules/calendar/*` (calendar, month-view, week-view, calendar-chip, day-panel, item-key, kinds, week-stats and their tests), `src/modules/dashboard/week-strip.tsx`, `src/app/(app)/{dashboard,plan,races,coach,settings}/page.tsx`, `src/app/(app)/activities/[id]/page.tsx`, `src/components/app-shell.tsx` (remove the static "Synced 12 min ago" text)
- Test: updated and new tests under the touched modules' `__tests__`

**Interfaces:**

- Consumes: Task 4 `CalendarItem`, `ActivityDTO`, `LapDTO`, `createCaller`, `trpcClient.training.*`.
- Produces: `ComingSoon` (props `{ title: string; description: string }`, test id `coming-soon`); `todayIn`; `Calendar` props `{ today: string }` (client component; the visible range is fetched with `trpcClient.training.getCalendar.useQuery({ from, to }, { placeholderData: keepPreviousData })`, shows a skeleton while loading the first range and an inline error with a retry on failure); `week-stats` helpers working on `CalendarItem[]` of activities only (`computeTotals` returns `doneMinutes`, `doneSessions`, `runKm`; `computeLoadRatio` unchanged semantics; drop the planned fields).

- [ ] **Step 1: Update and write failing tests first.** `week-stats.test.ts` and any test that imported mock types move to `CalendarItem`; add: `todayIn('Europe/Lisbon', new Date('2026-06-30T23:30:00Z'))` is `2026-07-01`; month view renders activity chips from a passed list and an empty state when the list is empty (test ids); `ComingSoon` renders title and description; the activity page logic: a missing activity calls `notFound`.
- [ ] **Step 2: Run** and confirm the new tests fail and nothing else regressed.
- [ ] **Step 3: Implement.** Remove every import of `@/modules/mock/*` (a final `grep -rn "modules/mock" src` must return nothing). Dashboard page: inside `Suspense`, `WeekStrip` (server component) reads the last 35 days through `createCaller().training.getCalendar` and shows time this week, sessions, run km and load ratio computed from real activities (no "planned" wording; an athlete with no activities sees zeros and "No history yet"), then `Calendar today={...}` where `today` comes from `todayIn(await createCaller().athlete.getTimezone())`. Remove the "Log session" button and the planned and race chip branches (they return with plans 3 and 5). Activity page: `generateStaticParams` is removed; render inside `Suspense`, fetch with `createCaller().training.getActivity`, show metrics, the laps table with station tags (`activity_laps.station` through `HYROX_STATION_LABELS`), and a "View on Strava" link to `https://www.strava.com/activities/<stravaId>` when the source is Strava; no feedback card, no "Add details". Plan, races, coach and settings pages render `ComingSoon` (settings gets its real content in Task 10); keep their nav entries. The calendar day panel lists the day's activities with links.
- [ ] **Step 4: Verify in the browser** (preview tools, name `roxcoach`; do not read `.env`; never enter real credentials): `/login` still works, `/dashboard` redirects to `/login` while signed out. Record that real data could not be exercised without a signed-in session.
- [ ] **Step 5: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 6: Commit** `refactor: remove mock data and render real activities`.

### Task 10: Settings Strava card, docs and spec updates

**Files:**

- Create: `src/modules/settings/strava-card.tsx`, `src/modules/settings/settings-view.tsx`
- Modify: `src/app/(app)/settings/page.tsx`, `docs/tech-specs/strava.md`, `docs/tech-specs/architecture.md`, `docs/tech-specs/database.md` (lap replacement note), `docs/tech-specs/ux-design.md` (settings), `.env.example`, `README.md` (Strava setup section)
- Test: `src/modules/settings/__tests__/strava-card.test.tsx`

**Interfaces:**

- Consumes: `trpcClient.strava.getStatus` (query), `getConnectUrl`, `disconnect`, `syncNow` (mutations); `?strava=` query values from the callback.
- Produces: `StravaCard` (props `{ result?: 'connected' | 'denied' | 'scope' | 'error' }`); test ids `strava-card`, `strava-status`, `strava-connect`, `strava-disconnect`, `strava-sync-now`, `strava-last-sync`, `strava-activity-count`, `strava-result`, `strava-attribution`.

- [ ] **Step 1: Write the failing tests** (mock `@/lib/trpc` and `next/navigation`): disconnected state shows only "Connect Strava"; clicking it calls `getConnectUrl` and assigns `window.location` to the returned URL; connected state shows last sync, count, "Sync now" and "Disconnect" (with a confirmation step before disconnecting); each `result` value shows its message ("Strava connected", "You did not allow access", "Roxcoach needs permission to read all your activities", "Something went wrong, try again"); the card never renders anything that looks like a token; the attribution "Compatible with Strava" is present; errors from mutations show a toast and keep the UI usable.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement** the card and the settings page (the page reads `searchParams.strava` inside `Suspense`, validates it against the four allowed values, ignores anything else). Settings shows only the Strava card now; profile and availability return with plan 3.
- [ ] **Step 4: Update the docs.** `docs/tech-specs/strava.md`: the plan's rulings (laps delete then insert, `local_date` from `start_date`, 404 means deleted, callback verifies its own session, enqueue failure marks the event `failed`), the final route and file names as built, and the subscription script usage. `docs/tech-specs/architecture.md`: `caller.ts` present, jobs list, env table (`TRIGGER_PROJECT_REF`). `README.md`: a short "Strava setup" section (register the app at strava.com/settings/api with the callback domain, set the four Strava env vars, create the Trigger.dev project and set `TRIGGER_PROJECT_REF` and `TRIGGER_SECRET_KEY`, deploy the jobs, run the subscription script once, connect in Settings). No em-dashes.
- [ ] **Step 5: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 6: Commit** `feat: strava settings card and docs`.
