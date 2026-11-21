# Dashboard Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dashboard has a Running and a Strength mode (saved in the athlete profile) and shows progress charts: pace, goal pace and pace by heart rate zone for running, and load progression of the 5 most used exercises plus body weight for strength.

**Architecture:** Each parsed run stores an HR histogram (`activities.hr_histogram`, bins of `[bpm, time_s, distance_m]`) built from the file's track points, so zones are computed at read time from the current profile. Two new tRPC procedures (`training.getRunProgress`, `training.getStrengthProgress`) aggregate with pure helpers and return ready-to-draw series. The frontend adds a mode switch, a range switch (URL state) and lazily loaded Recharts cards with a table fallback.

**Tech Stack:** Effect v4, tRPC 11, Supabase (schema `roxcoach`), zod 4, React 19, nuqs, Recharts, `pnpm test`.

**Spec:** `docs/tech-specs/dashboard-progress.md` (binding). Also read `docs/tech-specs/architecture.md`, `docs/tech-specs/manual-upload.md`, `docs/tech-specs/ux-design.md` and `CLAUDE.md`.

## Global Constraints

- All code, identifiers, comments, error tags, enum values and UI copy in English. No em-dashes anywhere (code, comments, docs, commits). `pnpm` only; run tests with `pnpm test` (never vitest directly); do not start a dev server; never read `.env*` files; nothing is pushed.
- Imports under `src/` use the `@/` alias. Types at the top of the file. Components take a named `type Props`. `cn()` for classes, semantic tokens only (chart colors are `var(--color-...)`, never raw hex). shadcn components use base-ui, never Radix. Every element used in tests has a `data-testid` and tests locate by test id only.
- `_bff` never imports from `src/lib`, `src/modules`, `src/components`, `src/hooks`, `src/app`. Code the frontend and `_bff` both need lives in `src/_bff/core/` and stays importable from client components (no `server-only`).
- Repositories: first parameters `supabase` then `userId`, every query filters by `user_id`, check both the `Effect.tryPromise` catch and the returned `error`. Controllers are thin, one constant per file, exhaustive `Match.tag`. New error codes go in `src/_bff/lib/error-codes.ts`. Cross-module reads go through `services/`.
- Heart rate zones: Karvonen, `bpm = resting + percent * (max - resting)`, floors Z2 60%, Z3 70%, Z4 80%, Z5 90%, Z1 is everything below Z2; both `max_hr` and `resting_hr` required. Histogram: `{ "v": 1, "bins": [[bpm, time_s, distance_m], ...] }`, time one decimal, distance whole meters, bpm integer 30 to 250; `MAX_SAMPLE_GAP_S = 10`, `MIN_MOVING_SPEED_MPS = 0.5`; a zone point needs `MIN_ZONE_SAMPLE_S = 300`.
- Ranges `3m` and `6m` use ISO weeks (Monday), `12m` uses calendar months, default `6m`. `TOP_EXERCISES = 5`. Epley `load * (1 + reps / 30)` for sets with 1 to 12 reps.
- Pre-commit runs `pnpm fmt`, `pnpm check`, `pnpm knip` and `git add -A`; every commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Update the specs in the same change when behavior, data or contracts change.

## Review Focus

Inputs and failure modes the spec implies but no single task would pin; each is tested in the task named in brackets.

1. A run whose file has no heart rate (or a TCX or GPX without the extension) gets the empty histogram `{ v: 1, bins: [] }`, still counts in the pace trend, and never appears as zone data [Tasks 3, 4, 7].
2. A profile with `max_hr` missing, `resting_hr` missing, or `max_hr <= resting_hr` yields `zoneBounds: null` and an empty-state, never NaN bounds or a crash; the pace trend still works [Tasks 2, 7, 8].
3. Strength sets with null load or null reps (bodyweight exercises, partial Lyfta data) must not produce NaN or zero points; an exercise with no usable load is left out of the ranking [Task 7].
4. A corrupt or old-version `hr_histogram` value in the database is treated as "not computed" and never fails the whole request; a run with zero distance or zero moving time never divides by zero [Tasks 3, 7, 8].
5. A series with 0, 1 or 2 points (new athlete, short range) shows a stat and the table instead of an empty-looking chart, and two workouts on the same date collapse to one point [Tasks 7, 10, 11].

---

## File Structure

| File                                                                                                          | Responsibility                                                                   |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `db/migrations/0015_dashboard_progress.sql`                                                                   | `athlete_profiles.dashboard_mode`, `activities.hr_histogram`                     |
| `src/_bff/core/constants/hr-zones.constants.ts`                                                               | `HR_ZONES`, `zoneBoundsBpm`, `zoneOfHeartRate` (client importable)               |
| `src/_bff/core/constants/progress.constants.ts`                                                               | ranges, default range, `MIN_ZONE_SAMPLE_S`, `TOP_EXERCISES`, histogram constants |
| `src/_bff/core/utils/progress-range.utils.ts`                                                                 | `rangeBounds`, `bucketStartOf`, `bucketStarts`                                   |
| `src/_bff/modules/training/helpers/build-hr-histogram.helper.ts`                                              | `buildHrHistogram`, `parseHrHistogram`                                           |
| `src/_bff/modules/training/helpers/build-run-progress.helper.ts`                                              | pace, zone, KPI aggregation                                                      |
| `src/_bff/modules/training/helpers/pick-goal-race.helper.ts`                                                  | goal race selection                                                              |
| `src/_bff/modules/training/helpers/build-strength-progress.helper.ts`                                         | top exercises and body weight                                                    |
| `src/_bff/modules/training/types/progress.ts`                                                                 | progress DTOs and histogram types                                                |
| `src/_bff/modules/training/services/backfill-hr-histograms.service.ts`                                        | reprocess stored files                                                           |
| `src/_bff/modules/training/services/get-run-progress.service.ts`, `get-strength-progress.service.ts`          | the two queries                                                                  |
| `src/_bff/modules/training/controllers/get-run-progress.controller.ts`, `get-strength-progress.controller.ts` | tRPC bindings                                                                    |
| `src/_bff/modules/athlete/{services,controllers}/set-dashboard-mode.*`                                        | persist the mode                                                                 |
| `tools/backfill-hr-histograms.ts`                                                                             | owner-run script                                                                 |
| `src/modules/dashboard/progress/*`                                                                            | chart cards, run and strength views, series styles                               |
| `src/modules/dashboard/{use-dashboard-mode.ts,dashboard-controls.tsx,use-progress-range.ts}`                  | mode and range controls                                                          |

---

### Task 1: Migration 0015

**Files:**

- Create: `db/migrations/0015_dashboard_progress.sql`
- Modify: `db/tests/schema.test.ts` (migration list and two tests), `db/README.md` (the `0001` to `0014` mentions), `docs/tech-specs/database.md` (columns and the migrations table row)

**Interfaces:**

- Produces: `athlete_profiles.dashboard_mode text not null default 'run' check (dashboard_mode in ('run','strength'))`; `activities.hr_histogram jsonb null`.

- [ ] **Step 1: Write the failing tests** in `db/tests/schema.test.ts`: add `'0015_dashboard_progress.sql'` to the applied-migrations list; `adds dashboard_mode with default 'run' and rejects other values` (insert a profile without the column and read `run`; updating to `'swim'` rejects with a check violation); `adds a nullable hr_histogram jsonb to activities` (insert an activity without it reads null, an update with `'{"v":1,"bins":[]}'` round-trips).
- [ ] **Step 2: Run** `pnpm test db/tests` and confirm the new tests fail.
- [ ] **Step 3: Write the migration** following the `0014` conventions (`begin;`, statements, `insert into roxcoach.schema_migrations (filename) values ('0015_dashboard_progress.sql');`, `commit;`). Two `alter table ... add column` statements with the definitions above, plus column comments. Check the column grants pattern of `0001`: if grants are per table nothing else is needed.
- [ ] **Step 4: Run** `pnpm test db/tests` (alone; it is slow under full-suite load). Expected: PASS.
- [ ] **Step 5: Update the docs** (`database.md`: both columns and the `0015` row; `db/README.md`: `0001` to `0015`).
- [ ] **Step 6: Commit** `feat: dashboard progress columns (migration 0015)`.

---

### Task 2: Heart rate zones (core)

**Files:**

- Create: `src/_bff/core/constants/hr-zones.constants.ts`
- Test: `src/_bff/core/constants/__tests__/hr-zones.constants.test.ts`

**Interfaces:**

- Produces:
    - `type ZoneNumber = 1 | 2 | 3 | 4 | 5`
    - `type HrZoneBounds = { zone: ZoneNumber; fromBpm: number; toBpm: number | null }` (`toBpm` inclusive, null for Z5)
    - `HR_ZONES: ReadonlyArray<{ zone: ZoneNumber; label: string; name: string; floorPct: number }>` (Z1 Recovery 0, Z2 Easy 0.6, Z3 Moderate 0.7, Z4 Threshold 0.8, Z5 Maximum 0.9)
    - `zoneBoundsBpm(profile: { maxHr: number | null; restingHr: number | null }): HrZoneBounds[] | null`
    - `zoneOfHeartRate(bpm: number, bounds: HrZoneBounds[]): ZoneNumber`

- [ ] **Step 1: Write the failing tests.** With max 190 and resting 50: Z2 starts at 134, Z3 148, Z4 162, Z5 176 (rounded), Z1 is `{ fromBpm: 0, toBpm: 133 }`, Z5 `toBpm` is null. `zoneBoundsBpm` returns null when either value is null and when `maxHr <= restingHr`. `zoneOfHeartRate`: 40 and 133 are Z1, 134 and 147 are Z2, 148 is Z3, 176 and 220 are Z5 (above the stored max still Z5).
- [ ] **Step 2: Run** `pnpm test src/_bff/core/constants` and confirm FAIL.
- [ ] **Step 3: Implement** the three exports; Z1 `fromBpm` is 0 and every other `toBpm` is the next zone's `fromBpm - 1`.
- [ ] **Step 4: Run** the same command, expect PASS.
- [ ] **Step 5: Commit** `feat: heart rate zone model`.

---

### Task 3: HR histogram builder

**Files:**

- Create: `src/_bff/core/constants/progress.constants.ts`, `src/_bff/modules/training/types/progress.ts` (histogram types now, DTOs in Task 8), `src/_bff/modules/training/helpers/build-hr-histogram.helper.ts`
- Test: `src/_bff/modules/training/helpers/__tests__/build-hr-histogram.helper.test.ts`

**Interfaces:**

- Produces (`types/progress.ts`): `HrSample = { t: number; hr: number | null; distanceM: number | null; speedMps: number | null }` (`t` epoch ms, `distanceM` cumulative); `HrBin = [bpm: number, timeS: number, distanceM: number]`; `HrHistogram = { v: 1; bins: HrBin[] }`.
- Produces (`progress.constants.ts`): `PROGRESS_RANGES = ['3m','6m','12m'] as const`, `type ProgressRange`, `DEFAULT_PROGRESS_RANGE = '6m'`, `MIN_ZONE_SAMPLE_S = 300`, `TOP_EXERCISES = 5`, `ONE_RM_MAX_REPS = 12`, `MAX_SAMPLE_GAP_S = 10`, `MIN_MOVING_SPEED_MPS = 0.5`, `MIN_HR_BPM = 30`, `MAX_HR_BPM = 250`.
- Produces (helper): `buildHrHistogram(samples: HrSample[]): HrHistogram`; `parseHrHistogram(value: unknown): HrHistogram | null` (zod, version 1 only).

- [ ] **Step 1: Write the failing tests.** (a) samples 1 s apart with hr 150, 150, 151 and cumulative distance 0, 3, 6 give bins `[[150, 1, 3], [151, 1, 3]]` (the interval takes the heart rate of its later point). (b) A 11 s gap is skipped, a 10 s gap is kept. (c) An interval with speed under 0.5 m/s (distance delta 0 over 1 s) is skipped. (d) Missing hr, hr 20 and hr 260 are skipped. (e) With `distanceM` null everywhere the `speedMps` of the later point gives the distance (3 m/s for 1 s gives 3 m); with neither distance nor speed the interval is skipped. (f) A negative distance delta is treated as stopped. (g) Time is rounded to one decimal, distance to whole meters, bins sorted by bpm, repeated bpm merged. (h) No usable interval returns `{ v: 1, bins: [] }`. (i) `parseHrHistogram` accepts a valid value and returns null for `null`, a string, `{ v: 2, bins: [] }`, and bins with the wrong shape.
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/training/helpers/__tests__/build-hr-histogram` and confirm FAIL.
- [ ] **Step 3: Implement** with the constants above. Speed of an interval is the distance delta over the time step, or the later point's `speedMps` when no distance delta exists.
- [ ] **Step 4: Run** the same command, expect PASS.
- [ ] **Step 5: Commit** `feat: HR histogram builder`.

---

### Task 4: Parsers and upload store the histogram

**Files:**

- Modify: `parse-fit.helper.ts`, `parse-tcx.helper.ts`, `parse-gpx.helper.ts` (all in `src/_bff/modules/training/helpers/`), `types/index.ts` (`ParsedActivity.hrHistogram: HrHistogram`, `NewActivityRow.hr_histogram: HrHistogram`), `repositories/activities.repository.ts` (`insertActivity` writes `hr_histogram`), `services/upload-activity.service.ts` (passes `parsed.hrHistogram`)
- Test: the existing `parse-fit`, `parse-tcx`, `parse-gpx` helper tests, `repositories/__tests__/activities-write.repository.test.ts`, `services/__tests__/upload-activity.service.test.ts`

**Interfaces:**

- Consumes: `buildHrHistogram(samples)` from Task 3.
- Produces: every parser returns `hrHistogram: HrHistogram` (never null; empty bins when no heart rate). FIT maps `recordMesgs` (`timestamp`, `heartRate`, cumulative `distance`, `enhancedSpeed` or `speed`); TCX maps each `Trackpoint` (`Time`, `HeartRateBpm.Value`, `DistanceMeters`); GPX maps `trkpt` (`time`, `extensions.TrackPointExtension.hr`, cumulative distance by haversine within a segment, restarting per segment). Export one pure mapper per parser (`fitSamples`, `tcxSamples`, `gpxSamples`) so tests can call it directly.

- [ ] **Step 1: Write the failing tests.** For each format: a file or inline sample with heart rate returns a histogram whose total time equals the sum of the usable intervals and whose bins are non-empty; a file without heart rate returns `{ v: 1, bins: [] }` and the rest of `ParsedActivity` is unchanged. The repository test asserts the insert payload contains `hr_histogram`. The upload service test asserts the saved row carries the parsed histogram.
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/training` and confirm the new tests FAIL.
- [ ] **Step 3: Implement** the mappers and wire the field through. The TCX zod schema currently reads only `Time` from trackpoints: extend it with the heart rate and distance leaves, defaulting missing ones.
- [ ] **Step 4: Run** `pnpm test src/_bff/modules/training`, expect PASS (existing tests included).
- [ ] **Step 5: Commit** `feat: store an HR histogram when parsing an activity file`.

---

### Task 5: Backfill service and script

**Files:**

- Modify: `repositories/activity-files-storage.repository.ts` (add `getActivityFile`), `repositories/activities.repository.ts` (add `selectBackfillTargets`, `updateHrHistogram`), `types/index.ts` (`StorageReadClient`), `src/_bff/lib/error-codes.ts` (new codes for the three new operations, each with an `_ERR` variant)
- Create: `src/_bff/modules/training/services/backfill-hr-histograms.service.ts`, `tools/backfill-hr-histograms.ts`
- Test: `services/__tests__/backfill-hr-histograms.service.test.ts`, repository tests next to the siblings, `tools/__tests__/backfill-hr-histograms.test.ts`

**Interfaces:**

- Consumes: `parseActivityFile` (Task 4), `HrHistogram`.
- Produces:
    - `type StorageReadClient = { storage: { from(bucket: string): { download(path: string): PromiseLike<{ data: Blob | null; error: { message: string } | null }> } } }`
    - `getActivityFile(storage: StorageReadClient, path: string): Effect<Uint8Array, ActivityFileStorageError>`
    - `selectBackfillTargets(supabase, userId): Effect<{ activityId: string; storagePath: string }[], ActivityQueryError>` (activities of the user with `hr_histogram is null`, `deleted_at is null`, and a `parsed` file)
    - `updateHrHistogram(supabase, userId, activityId, histogram): Effect<void, ActivityWriteError>`
    - `backfillHrHistograms(client: TrainingClient & StorageReadClient, userId: string): Effect<{ updated: number; failed: number }, ActivityQueryError>`
    - the script: `pnpm dlx tsx tools/backfill-hr-histograms.ts <user_id>`; validates the argument as a uuid, loads env in `main()` only (like `tools/gemini-smoke.ts`), uses `createDBAdminClient`, prints `updated: N, failed: M` and nothing else.

- [ ] **Step 1: Write the failing tests.** Service: two targets, both updated with the parsed histogram; a file that fails to parse or download counts as `failed` and the run continues; a file without heart rate writes `{ v: 1, bins: [] }` and counts as updated; the log for a failure contains the activity id and the error code only (assert no file bytes or paths); a second run finds no targets. Repositories: every query filters by `user_id`. Script: an argument that is not a uuid prints a usage line and does not touch the network; the output format is exactly the line above.
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/training tools` and confirm FAIL.
- [ ] **Step 3: Implement.** `selectBackfillTargets` can use the embedded `activity_files!inner(storage_path)` filter on `status = 'parsed'`; if the sibling fake cannot express it, use two queries. Process targets sequentially.
- [ ] **Step 4: Run** the same command, expect PASS.
- [ ] **Step 5: Commit** `feat: backfill HR histograms from stored files`.

---

### Task 6: Dashboard mode in the athlete profile

**Files:**

- Modify: `src/_bff/core/constants/athlete.constants.ts` (`DASHBOARD_MODES = ['run','strength'] as const`, `type DashboardMode`), `src/_bff/modules/athlete/types/index.ts` (`ProfileDTO.dashboardMode: DashboardMode`, `ProfileInput = Omit<ProfileDTO, 'dashboardMode'>`), `repositories/athlete-profiles.repository.ts` (select `dashboard_mode`, new `updateDashboardMode`), `athlete.router.ts`, `src/_bff/lib/error-codes.ts`, `src/modules/settings/profile-tab.tsx` (only if the new field breaks `toFormValues`)
- Create: `services/set-dashboard-mode.service.ts`, `controllers/set-dashboard-mode.controller.ts`
- Test: next to the siblings (repository, service, controller)

**Interfaces:**

- Produces: `updateDashboardMode(supabase, userId, mode: DashboardMode): Effect<void, ProfileQueryError>` (an update on the existing row; no matching row fails with `ProfileQueryError`); `setDashboardMode(user: User, mode: DashboardMode)` returning `{ status: 200 }`; `athlete.setDashboardMode` (input `z.object({ mode: z.enum(DASHBOARD_MODES) })`).

- [ ] **Step 1: Write the failing tests.** `getProfile` returns `dashboardMode` (`run` when the column holds the default); `updateProfile` never sends `dashboard_mode` in its payload; `updateDashboardMode` sends only that column and filters by `user_id`; the service rejects nothing it should accept and surfaces a missing row as an error; the controller maps `CreateSbClientError` and `ProfileQueryError` to `INTERNAL_SERVER_ERROR` and an invalid mode input is rejected by zod.
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/athlete` and confirm FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test src/_bff/modules/athlete src/modules/settings`, expect PASS.
- [ ] **Step 5: Commit** `feat: persist the dashboard mode in the athlete profile`.

---

### Task 7: Progress aggregation helpers

**Files:**

- Create: `src/_bff/core/utils/progress-range.utils.ts`, `src/_bff/modules/training/helpers/{build-run-progress,pick-goal-race,build-strength-progress}.helper.ts`
- Modify: `src/_bff/modules/training/types/progress.ts` (DTOs below)
- Test: one test file per helper in the matching `__tests__` folders

**Interfaces:**

- Consumes: `zoneOfHeartRate`, `HrZoneBounds`, `ProgressRange`, `MIN_ZONE_SAMPLE_S`, `TOP_EXERCISES`, `ONE_RM_MAX_REPS`, `HrHistogram`, `RaceDTO`, `startOfWeek`, `addDays`, `parseIsoDate` from `week-dates.utils`.
- Produces (`types/progress.ts`):
    - `RunZonePointDTO = { zone: ZoneNumber; paceSecPerKm: number | null; minutes: number }`
    - `RunBucketDTO = { start: string; paceSecPerKm: number | null; distanceKm: number; runs: number; zones: RunZonePointDTO[] }` (always 5 zones, Z1 to Z5)
    - `RunGoalDTO = { raceId: string; name: string; raceDate: string; daysLeft: number; distanceM: number; targetTimeS: number; paceSecPerKm: number }`
    - `RunProgressDTO = { range: ProgressRange; granularity: 'week' | 'month'; buckets: RunBucketDTO[]; zoneBounds: HrZoneBounds[] | null; hasZoneData: boolean; goal: RunGoalDTO | null; kpis: { avgPaceSecPerKm: number | null; distanceKm: number; runs: number; recentPaceSecPerKm: number | null; goalDeltaSecPerKm: number | null } }` (`goalDeltaSecPerKm` positive means slower than the goal)
    - `ExercisePointDTO = { date: string; topSetKg: number | null; estimatedOneRmKg: number | null }`; `TopExerciseDTO = { key: string; name: string; workouts: number; points: ExercisePointDTO[] }`; `BodyWeightPointDTO = { date: string; kg: number }`; `StrengthProgressDTO = { range: ProgressRange; exercises: TopExerciseDTO[]; bodyWeight: BodyWeightPointDTO[] }`
- Produces (functions):
    - `rangeBounds(today: string, range: ProgressRange): { from: string; granularity: 'week' | 'month' }` (`3m` is the 13 weeks ending with the current week, `6m` 26 weeks, `12m` the current month and the 11 before)
    - `bucketStartOf(date: string, granularity): string`; `bucketStarts(from: string, today: string, granularity): string[]`
    - `buildRunProgress(input: { runs: { localDate: string; distanceM: number | null; movingTimeS: number | null; hrHistogram: HrHistogram | null }[]; today: string; range: ProgressRange; zoneBounds: HrZoneBounds[] | null; goalRace: RaceDTO | null }): RunProgressDTO`
    - `pickGoalRace(races: RaceDTO[]): RaceDTO | null` (running races with a distance and status `upcoming`; priority A before B before C, then the earliest date)
    - `buildStrengthProgress(input: { range: ProgressRange; today: string; workouts: { activityId: string; localDate: string; bodyWeightKg: number | null }[]; sets: { activityId: string; exercise: string; sourceExerciseId: string | null; reps: number | null; loadKg: number | null }[] }): StrengthProgressDTO` (workouts in ascending start order)

- [ ] **Step 1: Write the failing tests.** Range: `rangeBounds('2026-11-20','3m')` starts on the Monday 12 weeks before the current week's Monday; `12m` starts on the first day of the month 11 months back; `bucketStarts` has no gaps and ends with the current bucket; a Sunday and a Monday fall in different weeks. Run progress: pace of a bucket is `sum(moving) / (sum(distance) / 1000)`; runs with zero distance or null moving time are left out of pace without dividing by zero; empty buckets exist with `null` pace and `runs: 0`; a histogram with 400 s in Z2 and 120 s in Z3 gives a Z2 point and `null` for Z3 (under 300 s) while `minutes` still reports 2; `zoneBounds: null` gives `hasZoneData: false` and all zone paces null; a null histogram counts only in pace; KPIs (average over the range, distance, runs, recent pace as the last bucket with data, goal delta); same-date runs share a bucket. Goal: priority and date ordering, Hyrox and distance-less and completed races ignored, pace `target / km`, `daysLeft` from `today`, null when there is none. Strength: ranking by distinct workouts with ties by total sets then name; key is `sourceExerciseId` else lower-cased trimmed name; display name is the most recent; `topSetKg` and Epley (100 kg x 5 gives 116.7, a 15-rep set is ignored for 1RM); sets with null load or null reps never produce NaN; an exercise with no usable load is excluded from the ranking; two workouts the same date collapse to one point with the max; only the first 5 are returned; body weight keeps the last value per date and skips nulls.
- [ ] **Step 2: Run** `pnpm test src/_bff/core src/_bff/modules/training/helpers` and confirm FAIL.
- [ ] **Step 3: Implement** the helpers (pure, no I/O, no `Date.now`).
- [ ] **Step 4: Run** the same command, expect PASS.
- [ ] **Step 5: Commit** `feat: progress aggregation helpers`.

---

### Task 8: Progress queries (repositories, services, controllers)

**Files:**

- Modify: `repositories/activities.repository.ts` (`selectRunsInRange`, `selectStrengthWorkoutsInRange`), `repositories/strength-sets.repository.ts` (`selectSetsForActivities`), `training.router.ts`, `src/_bff/lib/error-codes.ts`
- Create: `services/get-run-progress.service.ts`, `services/get-strength-progress.service.ts`, `controllers/get-run-progress.controller.ts`, `controllers/get-strength-progress.controller.ts`
- Test: services, controllers and repositories in the sibling `__tests__` folders

**Interfaces:**

- Consumes: Task 7 helpers and DTOs, `getAthleteTimezone`, the athlete profile service (`getProfile`), `listRaces` (use the existing filter for upcoming races), `todayIn`.
- Produces: `selectRunsInRange(supabase, userId, from, to)` returning `{ localDate; distanceM; movingTimeS; hrHistogram }[]` for `category = 'run'`, not deleted, ordered by `started_at` (the histogram is parsed with `parseHrHistogram`; an unparseable value becomes null); `selectStrengthWorkoutsInRange(supabase, userId, from, to)` returning `{ activityId; localDate; bodyWeightKg }[]` for `category = 'strength'`; `selectSetsForActivities(supabase, userId, activityIds)` (queries in chunks of 100 ids); `getRunProgress(user: User, range: ProgressRange): Effect<RunProgressDTO, ...>`; `getStrengthProgress(user: User, range: ProgressRange): Effect<StrengthProgressDTO, ...>`; `training.getRunProgress` and `training.getStrengthProgress` (input `z.object({ range: z.enum(PROGRESS_RANGES) })`, queries).

- [ ] **Step 1: Write the failing tests.** Repositories: every query filters by `user_id` and the date bounds, category filter present, a corrupt `hr_histogram` becomes null without failing, 250 activity ids produce three chunked queries. Services (inject deps like `uploadActivity` does, no module mocks): run progress uses the athlete timezone for `today`, builds `zoneBounds` from the profile heart rates (null when missing or inverted), picks the goal race, and passes the range bounds; strength progress returns top exercises and body weight; an empty history returns empty series, not an error. Controllers: exhaustive tag mapping to `INTERNAL_SERVER_ERROR`, invalid `range` rejected.
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/training` and confirm FAIL.
- [ ] **Step 3: Implement.** Never add a query without the `user_id` filter; select only the columns needed.
- [ ] **Step 4: Run** `pnpm test src/_bff`, expect PASS.
- [ ] **Step 5: Commit** `feat: run and strength progress queries`.

---

### Task 9: Dashboard shell, mode and range controls

**Files:**

- Modify: `package.json` (`pnpm add recharts`; if pnpm reports a missing `react-is` peer, add it at the React version), `src/_bff/core/utils/formatters.utils.ts` (`formatPaceSeconds(secPerKm)` returning `4:55 /km`, reusing `formatClock`; `formatKg(kg)` with at most one decimal), `src/modules/dashboard/dashboard-content.tsx`, its existing tests in `src/modules/dashboard/__tests__`
- Create: `src/modules/dashboard/use-dashboard-mode.ts`, `src/modules/dashboard/use-progress-range.ts`, `src/modules/dashboard/dashboard-controls.tsx`, `src/modules/dashboard/progress/chart-card.tsx`, `progress/chart-data-table.tsx`, `progress/change-badge.tsx`
- Test: `src/modules/dashboard/__tests__/dashboard-controls.test.tsx`, `progress/__tests__/chart-card.test.tsx`, formatter tests

**Interfaces:**

- Consumes: `athlete.getProfile` (carries `timezone` and `dashboardMode`; the dashboard stops using `getTimezone`), `athlete.setDashboardMode`, `DASHBOARD_MODES`, `PROGRESS_RANGES`, `DEFAULT_PROGRESS_RANGE`.
- Produces:
    - `useDashboardMode(): { mode: DashboardMode | null; setMode: (mode: DashboardMode) => void }` (optimistic: cancel and set the `getProfile` cache in `onMutate`, revert and `toast.error('Could not save your dashboard mode.')` on error, invalidate on settle)
    - `useProgressRange(): { range: ProgressRange; setRange: (range: ProgressRange) => void }` (nuqs, key `range`, `history: 'replace'`, default `6m`)
    - `DashboardControls` props `{ mode: DashboardMode; onModeChange: (mode: DashboardMode) => void; range: ProgressRange; onRangeChange: (range: ProgressRange) => void }` rendering two `Tabs` segmented controls (labels "Running", "Strength", "3M", "6M", "1Y"; triggers at least 44 px tall on touch; test ids `mode-tab-run`, `mode-tab-strength`, `range-tab-3m`, `range-tab-6m`, `range-tab-12m`)
    - `ChartCard` props `{ title: string; takeaway: string; testId: string; controls?: React.ReactNode; footnote?: React.ReactNode; children: React.ReactNode }`; `ChartDataTable` props `{ caption: string; columns: string[]; rows: (string | number | null)[][]; testId: string }` (a "View as table" disclosure button `${testId}-toggle`, the table `${testId}`); `ChangeBadge` props `{ delta: number | null; unit: string; testId: string }` rendering `+5 kg` or `-0:12 /km` with an up or down arrow icon and text, never color alone
- Header layout per the spec sketch: title, then controls, then the existing `ActivityActions`; on a phone the mode switch is full width. The page shows the dashboard skeleton until the profile loads (no flash of the wrong mode). The week strip stays in both modes. Below it render `<RunProgress range={range} />` or `<StrengthProgress range={range} />` (Tasks 10 and 11; until then render a placeholder `div` with test id `progress-placeholder` so this task is testable alone).

- [ ] **Step 1: Write the failing tests.** Controls: clicking a mode tab calls `onModeChange`, the active tab is exposed through `aria-selected`; range tabs likewise. Hook behavior through a component test with a fake tRPC client passed in (no module mock of the app code): the mode updates immediately, a failing mutation reverts it and shows the error toast. `ChartCard` shows title, takeaway, footnote and children. `ChartDataTable` is collapsed by default and shows the rows after the toggle. `ChangeBadge` renders sign, value and unit, and `null` renders a dash. Formatters: `formatPaceSeconds(295)` is `4:55 /km`, null and 0 give null; `formatKg(82.5)` is `82.5 kg`, `formatKg(80)` is `80 kg`.
- [ ] **Step 2: Run** `pnpm test src/modules/dashboard src/_bff/core/utils` and confirm FAIL.
- [ ] **Step 3: Implement** everything above. Keep chart-free code in this task.
- [ ] **Step 4: Run** `pnpm test src/modules/dashboard`, expect PASS (the existing dashboard tests updated for the profile query).
- [ ] **Step 5: Commit** `feat: dashboard mode and range controls`.

---

### Task 10: Running progress UI

**Files:**

- Create: `src/modules/dashboard/progress/{run-progress.tsx,run-progress-view.tsx,run-kpis.tsx,pace-chart.tsx,zone-pace-chart.tsx,series-styles.ts}`
- Modify: `src/modules/dashboard/dashboard-content.tsx` (render `RunProgress`)
- Test: `progress/__tests__/run-progress-view.test.tsx`, `run-kpis.test.tsx`

**Interfaces:**

- Consumes: `training.getRunProgress`, `RunProgressDTO`, `ChartCard`, `ChartDataTable`, `ChangeBadge`, `formatPaceSeconds`, `HR_ZONES`, `QueryError`, `Skeleton`, `DASHBOARD_QUERY_STALE_TIME`.
- Produces:
    - `series-styles.ts`: `ZONE_STYLES: Record<ZoneNumber, { color: string; dash: string | undefined; marker: 'circle' | 'square' | 'diamond' | 'triangle' | 'cross' }>` with Z1 `var(--color-slate)` circle, Z2 `var(--color-blue)` square, Z3 `var(--color-green)` diamond, Z4 `var(--color-tangerine)` triangle, Z5 `var(--color-tangerine-deep)` cross dashed `4 3`; plus `PACE_COLOR = 'var(--color-blue)'`, `GOAL_COLOR = 'var(--color-tangerine)'`
    - `RunProgress` props `{ range: ProgressRange }` (query, loading skeleton of fixed height, per-card error with retry via `QueryError` test id `run-progress-error`)
    - `RunProgressView` props `{ data: RunProgressDTO }` (pure, testable): KPI strip (test ids `kpi-avg-pace`, `kpi-distance`, `kpi-runs`, `kpi-goal`), the pace card (test id `pace-chart`, table `pace-chart-table`), the zone card (test id `zone-chart`, legend toggle buttons `zone-toggle-1` to `zone-toggle-5`, table `zone-chart-table`)
    - `PaceChart` props `{ buckets: RunBucketDTO[]; goal: RunGoalDTO | null; granularity: 'week' | 'month' }`; `ZonePaceChart` props `{ buckets: RunBucketDTO[]; hidden: ZoneNumber[] }`. Both are loaded with `next/dynamic` (`ssr: false`) from `RunProgressView`, with a skeleton of the same height, so Recharts is not in the first bundle.
- Behavior to build: pace Y axis reversed (faster is higher) with the caption "faster is up"; the goal is a dashed `ReferenceLine` labelled with pace, race name and days left; the goal tile says "Add a running race to see your goal pace" (link to `/races`) when `goal` is null and shows the delta with `ChangeBadge` (text "slower" or "faster", never color alone); the zone chart shows the empty state "Add your max and resting heart rate in Settings to see zones" (link to `/settings`) when `zoneBounds` is null, "No zone data yet. Upload a run with heart rate." when `hasZoneData` is false, and hides zones with no points; a series with 3 points or fewer shows the stat and the table instead of a line; `role="img"` with an `aria-label` summarising the message (for example "Average pace improved from 5:30 /km to 5:12 /km over 6 months"), Recharts `accessibilityLayer` on, animations off under `prefers-reduced-motion`, chart height 240 px on phone and 280 px from `md`, tooltips show the bucket date, value and minutes in zone.

- [ ] **Step 1: Write the failing tests** (data via props, no module mocks): KPI tiles show formatted values and the goal delta text; goal null shows the add-a-race empty state; `zoneBounds: null` shows the settings empty state; `hasZoneData: false` shows the upload empty state; clicking `zone-toggle-3` flips its `aria-pressed` and removes Z3 rows from the zone table; the table fallback rows carry the bucket start, pace (`m:ss /km`) and minutes; a data set with 2 buckets with data shows the stat and no chart; the aria-label summary text is present on `pace-chart`.
- [ ] **Step 2: Run** `pnpm test src/modules/dashboard/progress` and confirm FAIL.
- [ ] **Step 3: Implement.** SVG drawing itself is not asserted. Verify the contrast of every series against the card background in light and dark (3:1 for lines, 4.5:1 for text) while building and note the values in the commit body.
- [ ] **Step 4: Run** `pnpm test src/modules/dashboard`, expect PASS.
- [ ] **Step 5: Commit** `feat: running progress charts`.

---

### Task 11: Strength progress UI

**Files:**

- Create: `src/modules/dashboard/progress/{strength-progress.tsx,strength-progress-view.tsx,exercise-card.tsx,body-weight-card.tsx}`
- Modify: `src/modules/dashboard/dashboard-content.tsx` (render `StrengthProgress`)
- Test: `progress/__tests__/strength-progress-view.test.tsx`, `exercise-card.test.tsx`

**Interfaces:**

- Consumes: `training.getStrengthProgress`, `StrengthProgressDTO`, Task 9 and 10 building blocks, `formatKg`.
- Produces:
    - `StrengthProgress` props `{ range: ProgressRange }` (query, skeletons, `QueryError` with test id `strength-progress-error`)
    - `StrengthProgressView` props `{ data: StrengthProgressDTO }`: a metric toggle ("Top set" and "Est. 1RM", test ids `metric-top-set`, `metric-one-rm`, default top set), a grid of `ExerciseCard` (one column on phone, two from `md`, three from `xl`, test id `exercise-card`), then `BodyWeightCard`
    - `ExerciseCard` props `{ exercise: TopExerciseDTO; metric: 'topSetKg' | 'estimatedOneRmKg' }`: name, latest value, `ChangeBadge` of the change from the first to the last point in the range, a small line chart with its own Y axis, and the table fallback (`exercise-table`); `BodyWeightCard` props `{ points: BodyWeightPointDTO[] }` with test id `body-weight-card`
    - Charts are loaded with `next/dynamic` (`ssr: false`) with same-height skeletons; same accessibility and motion rules as Task 10.
- Empty states: no exercises "Sync Lyfta to see your progress" (link to `/settings`, the Lyfta tab); fewer than 3 points in an exercise shows the latest value and the table without a line; body weight with fewer than 2 points shows the single value or "No body weight logged yet".

- [ ] **Step 1: Write the failing tests:** the grid renders one card per exercise (5 given, 5 shown); switching the metric changes the displayed latest value (for example 100 kg x 5 shows `100 kg` as top set and `116.7 kg` as est. 1RM); a null 1RM series shows a dash; the change badge reads `+10 kg` for 90 to 100; an exercise with 2 points shows no chart and its table; no exercises shows the Lyfta empty state; body weight shows latest and change, and one point shows just the value.
- [ ] **Step 2: Run** `pnpm test src/modules/dashboard/progress` and confirm FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test src/modules/dashboard`, expect PASS.
- [ ] **Step 5: Commit** `feat: strength progress charts`.

---

### Task 12: Cache wiring, docs and final verification

**Files:**

- Modify: `src/modules/activity/upload-activity.tsx`, `src/modules/lyfta/use-lyfta-sync.ts`, `src/modules/races/races-manager.tsx`, `src/modules/settings/profile-tab.tsx`, `docs/tech-specs/{dashboard-progress,ux-design,athlete-races,manual-upload,architecture,README}.md`
- Test: the existing tests of those files, extended where they assert invalidations

**Interfaces:**

- Consumes: `utils.training.getRunProgress.invalidate()` and `utils.training.getStrengthProgress.invalidate()`.

- [ ] **Step 1: Write the failing tests:** an upload success invalidates run progress and strength progress next to the calendar; a Lyfta sync success invalidates strength progress; a race create, update, complete or delete invalidates run progress (the goal can change); saving the profile invalidates run progress (zones follow `max_hr` and `resting_hr`).
- [ ] **Step 2: Run** the affected test files via `pnpm test src/modules` and confirm FAIL.
- [ ] **Step 3: Implement** the invalidations.
- [ ] **Step 4: Update the specs:** `dashboard-progress.md` status to implemented and add the rule that an interval with neither distance nor speed is skipped when building the histogram; `ux-design.md` Dashboard section (modes, controls, charts, remove "charts are a follow-up"); `athlete-races.md` (`dashboardMode`, zones from `max_hr` and `resting_hr`); `manual-upload.md` (histogram in the pipeline, the backfill script and how to run it); `architecture.md` (new procedures and helpers); `README.md` index status.
- [ ] **Step 5: Run the full verification:** `pnpm fmt`, `pnpm check`, `pnpm knip`, `pnpm test`. Expected: all pass. The PGlite `db/tests` can time out under full-suite load; rerun `pnpm test db/tests` alone before reporting a failure.
- [ ] **Step 6: Commit** `feat: dashboard progress wiring and docs`.
