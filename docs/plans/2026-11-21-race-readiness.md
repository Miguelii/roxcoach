# Race Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Running dashboard shows a banner for the next race (days left, goal, race pace) and a readiness card that judges Load and Pace for it, including Hyrox races.

**Architecture:** Each run stores a pace histogram (`activities.pace_histogram`, like `hr_histogram`) built from the track points, so work faster than race pace is detected in any workout. `getRunProgress` gains a `readiness` field computed by pure helpers from the runs it already loads. The race pace comes from distance and goal time, or from a constant pace table for Hyrox. The frontend adds a banner and a card at the top of Running mode.

**Tech Stack:** Effect v4, tRPC 11, Supabase (schema `roxcoach`), zod 4, React 19, `pnpm test`.

**Spec:** `docs/tech-specs/2026-11-21-race-readiness-design.md` (approved). Also read `docs/tech-specs/dashboard-progress.md`, `docs/tech-specs/architecture.md` and `CLAUDE.md`.

## Global Constraints

- All code, identifiers, comments, error tags and UI copy in English. No em-dashes anywhere (code, comments, docs, commits). `pnpm` only, tests with `pnpm test` (never vitest directly), no dev server, never read `.env*`, nothing is pushed.
- Imports under `src/` use `@/`. Types at the top of the file. Components take a named `type Props`. `cn()` for classes, semantic tokens only. Every element used in tests has a `data-testid` and tests locate by test id only. Overlays use only `ConfirmDialog` or `DrawerFormLayout` (not needed here).
- `_bff` never imports from `src/lib`, `src/modules`, `src/components`, `src/hooks`, `src/app`. Code shared with the frontend lives in `src/_bff/core/` and stays client importable (no `server-only`).
- Repositories: first parameters `supabase` then `userId`, every query filters by `user_id`, check the `tryPromise` catch and the returned `error`. Cross-module reads go through `services/`.
- Hyrox run pace table (seconds per km, goal tier in seconds): 3600 -> 238 (3:58), 4500 -> 295 (4:55), 5400 -> 355 (5:55), 6300 -> 413 (6:53). Linear interpolation between tiers, nearest tier outside.
- Readiness: window 28 days ending today; fast session = run with at least 180 s in bins fully faster than race pace; Pace on track at 3 or more fast sessions; Load on track when the acute:chronic distance ratio is 0.8 to 1.3 and, when known, Z1+Z2 share is at least 70%; Taper when the race is 7 days away or less.
- Pace histogram: `{ "v": 1, "bins": [[paceSPerKm, time_s, distance_m], ...] }`, bin width 5 s/km, paces clamped to 150..600 s/km, same interval rules as the HR histogram (`MAX_SAMPLE_GAP_S`, `MIN_MOVING_SPEED_MPS`, later point owns the interval, no heart rate needed).
- Pre-commit runs `pnpm fmt`, `pnpm check`, `pnpm knip`; run `pnpm test` before committing. Every commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Update specs in the same change as the behavior.

## Review Focus

1. Hyrox goal below 1:00:00 or above 1:45:00 uses the nearest tier, exactly on a tier gives that tier [Task 1].
2. A treadmill or no-distance file produces an empty pace histogram and never counts as a fast session [Task 2].
3. A corrupt or old-version `pace_histogram` is treated as "not computed" and never fails `getRunProgress` [Tasks 2, 6].
4. Race today (0 days left) and a profile without heart rate bounds: Taper still applies, Load judges the ratio only and never flags attention for a missing easy share [Task 5].
5. No runs at all in the window gives `No data` on both rows, never `Needs attention` [Task 5].

## File Structure

- Create `src/_bff/core/constants/race-pace.constants.ts`, `src/_bff/core/utils/race-pace.utils.ts` (race pace).
- Create `src/_bff/core/constants/race-readiness.constants.ts` (thresholds).
- Create `src/_bff/modules/training/helpers/build-pace-histogram.helper.ts`.
- Create `src/_bff/modules/training/helpers/pick-next-race.helper.ts`, `build-race-readiness.helper.ts`.
- Create `db/migrations/0016_race_readiness.sql`.
- Modify parsers, `types/index.ts`, `types/progress.ts`, `activities.repository.ts`, `upload-activity.service.ts`, the backfill service and script, `build-run-progress.helper.ts`, `get-run-progress.service.ts`.
- Create `src/modules/dashboard/progress/race-banner.tsx`, `race-readiness-card.tsx`, `readiness-utils.ts`; modify `run-progress-view.tsx`.

---

### Task 1: Race pace

**Files:**

- Create: `src/_bff/core/constants/race-pace.constants.ts`, `src/_bff/core/utils/race-pace.utils.ts`
- Test: `src/_bff/core/utils/__tests__/race-pace.utils.test.ts`

**Interfaces:**

- Produces: `HYROX_RUN_PACE_TIERS: ReadonlyArray<{ goalS: number; paceSPerKm: number }>` and `racePaceSPerKm(race: { raceType: string; distanceM: number | null; targetTimeS: number }): number | null`.

- [ ] **Step 1: Write the failing test.** `racePaceSPerKm` cases: running 10 km in 2700 s gives 270; hyrox with 5400 gives 355; hyrox 4200 (1:10:00) gives about 276 (`toBeCloseTo(276, 0)`); hyrox 3000 gives 238; hyrox 9000 gives 413; hyrox 3600 gives 238; a non-hyrox race without distance gives `null`; a running race with distance 0 gives `null`.
- [ ] **Step 2: Run** `pnpm test src/_bff/core/utils/__tests__/race-pace.utils.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the tiers constant (values in Global Constraints) and `racePaceSPerKm`: a race with `distanceM > 0` returns `targetTimeS / (distanceM / 1000)` whatever its type; `raceType === 'hyrox'` without distance interpolates linearly between the two surrounding tiers and clamps outside; anything else returns `null`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat: race pace for running and hyrox races`.

### Task 2: Pace histogram builder

**Files:**

- Modify: `src/_bff/core/constants/progress.constants.ts`, `src/_bff/modules/training/types/progress.ts`
- Create: `src/_bff/modules/training/helpers/build-pace-histogram.helper.ts`
- Test: `src/_bff/modules/training/helpers/__tests__/build-pace-histogram.helper.test.ts`

**Interfaces:**

- Consumes: `HrSample` from `types/progress.ts`.
- Produces: constants `PACE_BIN_S = 5`, `MIN_PACE_S_PER_KM = 150`, `MAX_PACE_S_PER_KM = 600`; types `PaceBin = [paceSPerKm: number, timeS: number, distanceM: number]`, `PaceHistogram = { v: 1; bins: PaceBin[] }`; `buildPaceHistogram(samples: HrSample[]): PaceHistogram`; `parsePaceHistogram(value: unknown): PaceHistogram | null`.

- [ ] **Step 1: Write the failing tests.** (a) 10 samples 1 s apart at 4 m/s (pace 250) give one bin `[250, 9, 36]`; (b) a mix of 3 m/s (333.3, bin 330) and 5 m/s (200, bin 200) gives two bins sorted ascending by pace; (c) samples without heart rate still count (hr `null`); (d) a gap above `MAX_SAMPLE_GAP_S`, a speed under `MIN_MOVING_SPEED_MPS` and samples with no distance and no speed are skipped, giving `{ v: 1, bins: [] }`; (e) a pace of 100 s/km lands in the 150 bin and 900 in the 600 bin; (f) `parsePaceHistogram` returns the value for a valid object and `null` for `{ v: 2, bins: [] }`, `null` and a string.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.** Mirror `build-hr-histogram.helper.ts` (same interval distance rule and skips), but key each interval by its pace `dt / (distance / 1000)` clamped to the range and floored to `PACE_BIN_S`; time one decimal, distance whole meters; zod tuple schema for the parser.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat: pace histogram builder`.

### Task 3: Persist the pace histogram

**Files:**

- Create: `db/migrations/0016_race_readiness.sql`
- Modify: `parse-fit.helper.ts`, `parse-tcx.helper.ts`, `parse-gpx.helper.ts`, `types/index.ts` (`ParsedActivity`), `activities.repository.ts`, `upload-activity.service.ts`, `docs/tech-specs/database.md`
- Test: the existing parser, upload service and `activities-write` / `progress-queries` repository tests, plus `db/tests/schema.test.ts`.

**Interfaces:**

- Consumes: `buildPaceHistogram`, `parsePaceHistogram` (Task 2).
- Produces: `ParsedActivity.paceHistogram: PaceHistogram`; `selectRunsInRange` rows gain `paceHistogram: PaceHistogram | null`.

- [ ] **Step 1: Write failing tests.** Each parser test: the parsed fixture has `paceHistogram.v === 1` and, for a fixture with distance or speed, at least one bin; a file without distance gives `bins: []`. Upload service test: the inserted row carries `pace_histogram`. `selectRunsInRange` test: a row with a valid `pace_histogram` returns it, a corrupt one returns `null` and the call still succeeds. Schema test follows the `0015` pattern for the new column.
- [ ] **Step 2: Run** `pnpm test src/_bff/modules/training` and the db schema test as `0015` is run. Expected: FAIL.
- [ ] **Step 3: Implement.** Migration `0016_race_readiness.sql` in the `0015` style (one transaction, nullable `pace_histogram jsonb`, column comment, `schema_migrations` insert). Each parser adds `paceHistogram: buildPaceHistogram(<its samples function>(...))` next to `hrHistogram`. The upload service writes `pace_histogram: parsed.paceHistogram`. `selectRunsInRange` also selects `pace_histogram`, validated with `z.unknown()` in the row schema and mapped through `parsePaceHistogram`. Document the column in `database.md`.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: store a pace histogram per activity`.

### Task 4: Backfill both histograms

**Files:**

- Modify: `activities.repository.ts` (`selectBackfillTargets`, `updateHrHistogram`), `backfill-hr-histograms.service.ts`, `tools/backfill-hr-histograms.ts`, `package.json` script if it names the file, and their tests.

**Interfaces:**

- Produces: `updateHistograms(supabase, userId, activityId, histograms: { hrHistogram: HrHistogram; paceHistogram: PaceHistogram })` replacing `updateHrHistogram`; service and script renamed to `backfillHistograms` and `tools/backfill-histograms.ts` (update every reference found with a project-wide search).

- [ ] **Step 1: Write failing tests.** `selectBackfillTargets` selects activities where `hr_histogram` or `pace_histogram` is null (`.or('hr_histogram.is.null,pace_histogram.is.null')`); the service writes both histograms of the parsed file with one update and keeps counting failures without stopping; an activity that already has both is not selected.
- [ ] **Step 2: Run** the backfill tests. Expected: FAIL.
- [ ] **Step 3: Implement** the repository change, the update function and the renames, keeping the idempotent and resumable behavior and the rule that only the activity id and error code are reported.
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: backfill pace histograms with the heart rate ones`.

### Task 5: Readiness helpers

**Files:**

- Create: `src/_bff/core/constants/race-readiness.constants.ts`, `pick-next-race.helper.ts`, `build-race-readiness.helper.ts`
- Modify: `src/_bff/modules/training/types/progress.ts`
- Test: `helpers/__tests__/pick-next-race.helper.test.ts`, `helpers/__tests__/build-race-readiness.helper.test.ts`

**Interfaces:**

- Consumes: `racePaceSPerKm` (Task 1), `PaceHistogram`, `HrHistogram`, `HrZoneBounds`, `zoneOfHeartRate`, `RaceDTO`, `RunRow` shape of `build-run-progress.helper.ts` extended with `paceHistogram: PaceHistogram | null`.
- Produces: constants `RACE_READINESS = { WINDOW_DAYS: 28, RATIO_MIN: 0.8, RATIO_MAX: 1.3, EASY_SHARE_MIN: 0.7, MIN_FAST_S: 180, FAST_SESSIONS_TARGET: 3, TAPER_DAYS: 7 }`; types `ReadinessState = 'on_track' | 'attention' | 'no_data' | 'taper'` and
  `RunReadinessDTO = { race: { raceId: string; name: string; raceType: string; raceDate: string; daysLeft: number; targetTimeS: number; priority: string; racePaceSPerKm: number }; load: { state: ReadinessState; weeklyKm: number; previousWeeklyKm: number | null; ratio: number | null; easySharePct: number | null }; pace: { state: ReadinessState; fastSessions: number; fastTimeS: number } }`;
  `pickNextRace(races: RaceDTO[]): RaceDTO | null`; `buildRaceReadiness(input: { runs: RunRow[]; today: string; zoneBounds: HrZoneBounds[] | null; race: RaceDTO | null }): RunReadinessDTO | null`.

- [ ] **Step 1: Write failing tests.** `pickNextRace`: eligible are upcoming `running` races with a distance and upcoming `hyrox` races; priority A first, then earliest date, then name; completed, cancelled and a running race without distance are ignored; empty list gives `null`. `buildRaceReadiness`: no race or a race with `racePaceSPerKm === null` gives `null`; no runs in the window gives `no_data` on both rows; 4 weekly runs of 10 km, ratio 1.0 and 80% of time in Z1+Z2 gives Load `on_track`, `weeklyKm` 10 and `easySharePct` 80; ratio 1.6 gives `attention`; easy share 50% gives `attention`; `zoneBounds: null` ignores the easy share and judges the ratio only; 3 runs with 200 s in bins fully faster than race pace give Pace `on_track`, `fastSessions` 3, `fastTimeS` 600; 2 such runs give `attention`; a bin that straddles the race pace does not count; runs whose `paceHistogram` is `null` give Pace `no_data`; a race 5 days away turns `on_track` and `attention` into `taper` and leaves `no_data` alone; a race today gives `daysLeft` 0 and `taper`.
- [ ] **Step 2: Run** both test files. Expected: FAIL.
- [ ] **Step 3: Implement.** Window is `today - 27` to `today`. Ratio: distance of the last 7 days divided by one quarter of the distance of days `today - 34` to `today - 7` (same shape as `computeLoadRatio`, but over run distance, null when the chronic part is 0). `weeklyKm` is the window distance divided by 4 and `previousWeeklyKm` the same for the 28 days before it (null without runs there). Easy share is time in zones 1 and 2 over time in all zones across the window histograms. A bin counts as faster when `bin pace + PACE_BIN_S <= racePaceSPerKm`. `pickNextRace` sorts like `pick-goal-race.helper.ts`.
- [ ] **Step 4: Run** both files. Expected: PASS.
- [ ] **Step 5: Commit** `feat: race readiness rules`.

### Task 6: Readiness in `getRunProgress`

**Files:**

- Modify: `build-run-progress.helper.ts`, `get-run-progress.service.ts`, `types/progress.ts` (`RunProgressDTO.readiness`), tests of both.

**Interfaces:**

- Consumes: `pickNextRace`, `buildRaceReadiness` (Task 5).
- Produces: `RunProgressDTO.readiness: RunReadinessDTO | null`; `buildRunProgress` input gains `nextRace: RaceDTO | null` (update every existing call and test fixture with `nextRace: null`).

- [ ] **Step 1: Write failing tests.** `buildRunProgress` with a hyrox `nextRace` and runs returns a `readiness` whose `race.racePaceSPerKm` is the interpolated pace; with `nextRace: null` returns `readiness: null`. Service test with fake deps: an upcoming Hyrox race gives a non-null `readiness`; a corrupt `pace_histogram` in a run row still returns the payload.
- [ ] **Step 2: Run** the training tests. Expected: FAIL.
- [ ] **Step 3: Implement.** The service passes `nextRace: pickNextRace(races)` next to the existing `goalRace`; the existing `goal` is unchanged. The range runs already cover the 62 days the rules need for ranges `3m` and above.
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: readiness in the run progress payload`.

### Task 7: Banner and readiness card

**Files:**

- Create: `src/modules/dashboard/progress/race-banner.tsx`, `race-readiness-card.tsx`, `readiness-utils.ts`
- Modify: `src/modules/dashboard/progress/run-progress-view.tsx`
- Test: `src/modules/dashboard/progress/__tests__/race-banner.test.tsx`, `race-readiness-card.test.tsx`, `readiness-utils.test.ts`, and the existing `run-progress-view` test.

**Interfaces:**

- Consumes: `RunReadinessDTO`; `daysUntil`, `formatDaysToGo`, `formatRaceDate`, `PRIORITY_LABELS` from `@/modules/races/utils`; `formatClock`, `formatPaceSeconds` from `@/_bff/core/utils/formatters.utils`.
- Produces: `<RaceBanner readiness={RunReadinessDTO} />`, `<RaceReadinessCard readiness={RunReadinessDTO} />`, and `loadReason(load): string`, `paceReason(pace, racePaceSPerKm): string`, `stateLabel(state): string` in `readiness-utils.ts`.

- [ ] **Step 1: Write failing tests.** `stateLabel` returns `On track`, `Needs attention`, `No data`, `Taper`. `loadReason` for 38 km/week, ratio 1.06 and easy share 71 returns text containing `38 km/week` and `71%`; with `easySharePct: null` it omits the share. `paceReason` for 2 fast sessions and race pace 276 contains `2 runs`, `4:36 /km` and `aim for 3`; for `no_data` it says to add runs with a pace. Banner (`race-banner`): shows the race name, days to go, goal time, race pace and priority, links to `/races`, test ids `race-banner`, `race-banner-name`, `race-banner-days`, `race-banner-goal`, `race-banner-pace`. Card: test ids `readiness-card`, `readiness-load-state`, `readiness-load-reason`, `readiness-pace-state`, `readiness-pace-reason`; each state shows its label text, not color alone. The run progress view renders the banner and card when `data.readiness` is set and neither when it is `null`.
- [ ] **Step 2: Run** the new tests. Expected: FAIL.
- [ ] **Step 3: Implement the three files and the wiring.** Banner and card go at the top of `RunProgressView`, above the week dots, with the card height reserved so the page does not jump. Before styling, invoke the `high-end-visual-design` skill for the visual direction of both components, then apply it inside the project rules: existing tokens, the `display` font and surface radii already used by `ChartCard` and `GoalPaceCard`, tone `amber` for the banner as in the old `NextRaceView` (commit `e954b9d`), no raw colors, and a layout that stacks on a phone. Where the skill conflicts with `CLAUDE.md` or the specs (fonts, icons, shadows), the project rules win. States use an icon plus the label text.
- [ ] **Step 4: Run** `pnpm test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: race banner and readiness card on the running dashboard`.

### Task 8: Specs and final check

**Files:**

- Modify: `docs/tech-specs/dashboard-progress.md`, `docs/tech-specs/manual-upload.md`, `docs/tech-specs/ux-design.md`, `docs/tech-specs/database.md` (if not done in Task 3), `docs/tech-specs/architecture.md` if the file list there changes.

- [ ] **Step 1:** In `dashboard-progress.md` remove the "Hyrox specific charts" non-goal wording that conflicts, add the readiness section (race pace table, pace histogram, rules, taper, payload field) and the new backfill step. In `manual-upload.md` document the pace histogram next to the HR one. In `ux-design.md` describe the banner and card. Keep no em-dashes.
- [ ] **Step 2: Run** `pnpm fmt`, `pnpm check`, `pnpm typecheck`, `pnpm knip` and `pnpm test`. Expected: all pass except failures that already existed before this work (list them in the report).
- [ ] **Step 3: Commit** `docs: race readiness specs`.
- [ ] **Step 4:** Tell the owner to apply migration `0016` and run the renamed backfill script once, so existing runs get a pace histogram.
