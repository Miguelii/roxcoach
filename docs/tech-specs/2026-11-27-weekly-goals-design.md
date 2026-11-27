# Weekly goals and run types

## Intent

The Availability tab in Settings (a typical week of fixed or flexible slots) is not used in practice. What the athlete
actually plans around is a weekly target: so many kilometers of running, one long run, one fast run, so many strength
sessions. This change removes availability completely (screen, API, table, coach input) and replaces it with **weekly
goals**. The dashboard then tells the athlete, at a glance, what is still missing this week ("You still need a long
run", "11.6 km to go"), in Running mode for the running goals and in Strength mode for the strength goal.

To know whether a long or a fast run was done, every run gets a **run type** (`long`, `fast` or none), set automatically
when the run enters the app (upload or Zepp import) from the athlete's rules, shown on the activity page and editable
there.

Running is the priority; the strength goal is a single count.

## Goals

- A **Goals** tab in Settings replaces **Availability**. Every goal is optional (empty means no goal and no reminder):
    - weekly running distance (km),
    - long runs per week,
    - fast runs per week,
    - strength sessions per week.
- The run type rules are editable in the same tab, with the athlete's values as defaults (see Run type rules).
- Every `run` activity stores its run type, computed when it is inserted, from any source. Existing runs are classified
  once by the migration.
- The activity page of a run shows its type and lets the athlete change it (long, fast, none) or give it back to the
  rules. A manual choice is never overwritten by the app.
- Changing the rules reclassifies every run that was not set by hand.
- A **This week's goals** card on the dashboard, right under the week strip: Running mode shows the running goals,
  Strength mode the strength goal. Met goals stay visible with a check, so the week reads as a whole.
- The coach receives the goals, this week's progress and the type of each recent run instead of the availability.
- Availability is removed everywhere: table, enum, API, Settings tab, coach context and tool, tests, fixtures, docs.

## Non-goals

- Goals that change week to week, a goal history, or "goal met" streaks. There is one set of goals, the same every week.
- Notifications or push reminders. Reminders live on the dashboard only.
- Run type badges in the calendar or in the dashboard's latest runs list (possible follow-up).
- Detecting intervals from laps or heart rate zones. The rule uses distance and overall pace only, as the athlete
  defined it.
- Run types for Hyrox activities. Only `category = 'run'` gets a type and counts toward the running goals, like the rest
  of Running mode.
- Goals for other categories (cross, Hyrox), time based goals, or a total run count goal.

## Anti-goals

- A reminder that is wrong because a run was misclassified and cannot be fixed. Every automatic type must be one tap
  away from being corrected on the activity page.
- The app silently undoing a correction (on a rules change, a resync or a backfill).
- A dashboard that jumps while loading: the card reserves its height like the other cards.
- Goals that nag: no red alarm styling for a goal that is simply not done yet on a Tuesday.

## Run type rules

Overall pace is `moving_time_s / (distance_m / 1000)`, in seconds per km. When `moving_time_s` is null,
`elapsed_time_s` is used. A run without a distance or without any time gets no type.

With the defaults (`shortRunMaxKm = 3`, `longRunMinKm = 6`, `fastPaceSPerKm = 300`, that is 5:00/km):

| Distance                        | Overall pace        | Type   |
| ------------------------------- | ------------------- | ------ |
| below 3 km                      | any                 | none   |
| from 3 km up to 6 km, inclusive | faster than 5:00/km | `fast` |
| from 3 km up to 6 km, inclusive | 5:00/km or slower   | `long` |
| above 6 km                      | any                 | `long` |

Example from the athlete: 5.1 km at 5:35/km is `long` (an easy run counts as the long one). 5.0 km at 4:50/km is
`fast`. 6.0 km at 4:55/km is `fast`. 6.01 km at any pace is `long`. 2.5 km at 4:30/km has no type.

`long` therefore means "long or easy", which is how the athlete counts it. UI labels: **Long run** and **Fast run**.

The three thresholds are per athlete (stored with the goals). Validation: `0 < shortRunMaxKm < longRunMinKm <= 100`,
`fastPaceSPerKm` between 120 (2:00/km) and 600 (10:00/km). Distances are compared in meters, so the thresholds are
stored in meters and shown in km in the form.

The rule is one pure function, `classifyRun({ distanceM, movingTimeS, elapsedTimeS }, rules)`, returning
`'long' | 'fast' | null`, in `src/_bff/modules/training/helpers/classify-run.helper.ts`. Only `_bff` uses it.

## Approaches considered

### Where the run type lives

| Approach                                                                   | Trade-off                                                                                                                                                           | Decision   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Stored on `activities` (`run_type` + `run_type_manual`), set on insert** | One write per import, reads are plain columns (calendar, coach, dashboard), and it is what the athlete asked for. A rules change needs a reclassify step            | **Chosen** |
| Computed at read time, only manual overrides stored                        | Never stale, but every reader (calendar, coach context, coach tools, activity page) must load the rules and classify, and overrides still need the same two columns | Rejected   |
| A separate tags table                                                      | Flexible for future tags, but a join on every read for a single value per run                                                                                       | Rejected   |

### Where the goals live

| Approach                                        | Trade-off                                                                                                                          | Decision   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **A `weekly_goals` table, one row per athlete** | Its own tab, its own save endpoint and validation, typed columns with check constraints, deleted with the user by its foreign key  | **Chosen** |
| More columns on `athlete_profiles`              | No new table, but the profile form and its validation keep growing with unrelated concerns, and the Goals tab would save a profile | Rejected   |
| One row per goal type (key and value)           | New goal types need no migration, but loses column checks and typed selects for a set of four known goals                          | Rejected   |

### Where the weekly progress is computed

| Approach                                                                        | Trade-off                                                                                                                 | Decision   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **A pure function shared by the dashboard and the coach, fed by existing data** | The dashboard already loads this week's activities for the week strip (`training.getCalendar`), so no new endpoint for it | **Chosen** |
| A `getWeeklyGoalProgress` endpoint                                              | One more round trip and a second copy of this week's activities                                                           | Rejected   |

## Data model

Migration `0025_weekly_goals.sql`, following the conventions of the latest migrations (one transaction, RLS policies in
the `(select auth.uid())` initplan form of `0023`, grants as in `0001`, ends with the `schema_migrations` insert).
Run `pnpm db:types` in the same change. Update [database.md](database.md).

### Remove availability

- `drop table roxcoach.availability_slots;`
- `drop type roxcoach.session_kind;` (its only other user, `planned_sessions`, was dropped in `0009`).

### `weekly_goals`

| Column                       | Type              | Notes                                                                                                       |
| ---------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `user_id`                    | uuid primary key  | `default auth.uid()`, references `auth.users (id) on delete cascade`                                        |
| `weekly_run_distance_m`      | int null          | null = no goal; check between 1000 and 500000                                                               |
| `long_runs_per_week`         | smallint null     | null = no goal; check between 1 and 7                                                                       |
| `fast_runs_per_week`         | smallint null     | null = no goal; check between 1 and 7                                                                       |
| `strength_sessions_per_week` | smallint null     | null = no goal; check between 1 and 14                                                                      |
| `short_run_max_m`            | int not null      | default 3000                                                                                                |
| `long_run_min_m`             | int not null      | default 6000; check `short_run_max_m > 0 and short_run_max_m < long_run_min_m and long_run_min_m <= 100000` |
| `fast_pace_s_per_km`         | smallint not null | default 300; check between 120 and 600                                                                      |
| `created_at`, `updated_at`   | timestamptz       | `set_updated_at` trigger                                                                                    |

Owner policies for select, insert and update (no delete: the row goes with the user). A missing row means "no goals,
default rules"; the read service returns the defaults in that case, and the first save inserts the row (upsert on
`user_id`).

Add `DbTables.WEEKLY_GOALS`; remove `DbTables.AVAILABILITY_SLOTS`.

### `activities`

| Column            | Type                     | Notes                                                                |
| ----------------- | ------------------------ | -------------------------------------------------------------------- |
| `run_type`        | `roxcoach.run_type` null | new enum `run_type as enum ('long', 'fast')`; null = no type         |
| `run_type_manual` | boolean not null         | default false; true once the athlete picked a type, including "none" |

Check: `category = 'run' or (run_type is null and run_type_manual = false)`.

The migration classifies every existing, not deleted `run` with the default rules in one `update ... set run_type =
case ... end`, the same rule as `classifyRun` written in SQL (moving time, falling back to elapsed time). Vitest cannot
check that the SQL and the TypeScript agree, so the migration carries a comment pointing at `classify-run.helper.ts`,
and the `db/tests` suite gets a case per row of the rules table.

Resyncs keep manual choices: the Zepp sync skips activities the athlete already has, and Lyfta upserts only touch
strength workouts. Clearing an integration's activities deletes them, types included, which is expected.

## Backend

### `athlete` module: goals

Replaces every availability file (controllers, services, repository, validation helper, constants, types, tests).

| File                                          | Role                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `repositories/weekly-goals.repository.ts`     | `selectWeeklyGoals(supabase, userId)`, `upsertWeeklyGoals(supabase, userId, row)`             |
| `helpers/weekly-goals-validation.helper.ts`   | pure validation of the ranges and of `shortRunMaxM < longRunMinM`                             |
| `services/get-weekly-goals.service.ts`        | the saved goals, or the defaults when there is no row; used by the coach and training modules |
| `services/save-weekly-goals.service.ts`       | validates, upserts, and when a threshold changed calls `reclassifyRuns` of `training`         |
| `controllers/get-weekly-goals.controller.ts`  | protected query `athlete.getWeeklyGoals`                                                      |
| `controllers/save-weekly-goals.controller.ts` | protected mutation `athlete.saveWeeklyGoals`                                                  |

DTO (`WeeklyGoalsDTO`): `weeklyRunDistanceM`, `longRunsPerWeek`, `fastRunsPerWeek`, `strengthSessionsPerWeek` (each
`number | null`) and `runTypeRules: { shortRunMaxM, longRunMinM, fastPaceSPerKm }`. Defaults and limits live in
`src/_bff/core/constants/weekly-goals.constants.ts` (the form uses them too).

Save returns the saved goals plus `reclassified: number` (runs whose type changed), so the toast can say "Goals saved.
3 runs reclassified." when it is not zero.

Errors: replace the availability tagged errors and codes with `WeeklyGoalsQueryError`, `WeeklyGoalsSaveError` and a
validation error, each mapped exhaustively in the controllers.

### `training` module: run types

- `insertActivity` (upload) and `insertZeppActivity` (Zepp) set `run_type` from `classifyRun` for `run` activities.
  Both import paths load the rules once per request or per sync: the upload service through `getWeeklyGoals`, the Zepp
  sync through `createImportContext`, which gains `runTypeRules` next to `timeZone`.
  An activity labelled as Hyrox at upload is not a `run` and gets no type.
- `services/set-run-type.service.ts` + `controllers/set-run-type.controller.ts`: protected mutation
  `training.setRunType` with input `{ activityId: uuid, runType: 'long' | 'fast' | 'none' | 'auto' }`.
  `long`, `fast` and `none` store the type (`none` stores null) with `run_type_manual = true`. `auto` sets
  `run_type_manual = false` and recomputes the type with the athlete's rules. The repository update filters by
  `user_id`, `id` and `category = 'run'` and fails with a not found error when no row matched.
- `services/reclassify-runs.service.ts` (`reclassifyRuns(supabase, userId, rules)`): selects the athlete's not deleted
  runs with `run_type_manual = false` (id, distance, times, current type), classifies them, and updates only the ones
  whose type changed, grouped by new type (at most three `update ... in (ids)` calls). Returns the count.
- `ActivityDTO` gains `runType: 'long' | 'fast' | null` and `runTypeManual: boolean`. Every select of an activity
  that maps to the DTO adds both columns through `selectColumns`.
- Lyfta imports are strength only and never set a type.

### Weekly progress (shared)

Pure function `computeWeeklyGoalProgress({ goals, items, today })` in
`src/_bff/core/utils/weekly-goals.utils.ts` (used by the dashboard and by the coach context, so it lives in `core` and
stays importable from client components). `items` are `CalendarItem`s; the week is Monday to Sunday of `today`
(`startOfWeek` from `week-dates.utils.ts`).

It returns, for each goal that is set:

| Goal              | Done                                                                                       | Remaining                       |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------------------- |
| Weekly distance   | sum of `distanceM` of this week's `run` items (the same rule as the week strip's run tile) | `max(0, goal - done)` in meters |
| Long runs         | count of this week's runs with `runType = long`                                            | `max(0, goal - done)`           |
| Fast runs         | count with `runType = fast`                                                                | `max(0, goal - done)`           |
| Strength sessions | count of this week's `strength` items                                                      | `max(0, goal - done)`           |

plus `daysLeft`: the days from `today` to Sunday, today included (Monday 7, Sunday 1).

## Frontend

### Settings: Goals tab

`settings-tabs.tsx` replaces the `availability` tab with `goals` (label **Goals**, `data-testid="settings-tab-goals"`).
The availability editor, its hook and tests are deleted.

`goals-tab.tsx` loads `athlete.getWeeklyGoals` and renders `goals-form.tsx` with its hook `use-goals-form.ts`
(react-hook-form, zod schema and `FormValues` in the hook, shadcn `Form` / `FormField`). Two groups:

- **Weekly goals**: Running distance (km, decimal), Long runs, Fast runs, Strength sessions. Each field can be left
  empty; a helper line says "Leave empty for no goal."
- **Run types**: Short run under (km), Long run over (km), Fast pace under (min:sec per km, entered as `m:ss`). A
  one-line summary under the group reads the rule back in words, for example "Runs from 3 to 6 km faster than 5:00/km
  are fast. Longer or slower runs are long. Runs under 3 km have no type."

The form converts km to meters and `m:ss` to seconds. Save shows a toast and invalidates `athlete.getWeeklyGoals`,
`training.getCalendar` and `training.getActivity` (types may have changed).

### Dashboard: This week's goals card

`weekly-goals-card.tsx` in `src/modules/dashboard`, rendered right under the week strip in both modes. It reads
`athlete.getWeeklyGoals` and the same `training.getCalendar` query as the week strip (same query key, so no second
request), then `computeWeeklyGoalProgress`.

```
This week's goals                         4 days left
─────────────────────────────────────────────────────
Weekly distance   18.4 / 30 km   ████████░░░░░   11.6 km to go
Long runs         0 / 1                          You still need a long run
Fast runs         1 / 1                          ✓ Done
```

- Running mode shows distance, long runs and fast runs (only the ones that are set); Strength mode shows strength
  sessions ("2 / 3 · 1 more strength session to go").
- Copy: "You still need a long run" / "You still need 2 long runs", "You still need a fast run", "11.6 km to go",
  "1 more strength session to go", "Done". "Last day" instead of "1 day left" on Sunday.
- A met goal shows a check and "Done" in the normal text color; an open goal uses the muted foreground, never a
  destructive color.
- No goal set for the current mode: one line, "Set weekly goals to see what is left this week", linking to
  `/settings?tab=goals`. The Settings tabs do not read the URL today: the settings page reads `searchParams.tab`
  (generated `PageProps<'/settings'>`), and `SettingsTabs` takes it as its initial tab when it is a valid value
  (and marks it as visited so its panel mounts). Any other value falls back to Profile.
- The distance bar is a plain progress bar with the numbers next to it, so the value never depends on color alone.
- Loading: a skeleton with the card's height. Error: the same inline error pattern as the week strip.
- Every element carries a `data-testid` (`weekly-goals-card`, `weekly-goal-<distance|long|fast|strength>`, with
  `-value` and `-remaining` children, `weekly-goals-empty`, `weekly-goals-days-left`).

### Activity page: run type

For `run` activities, `activity-view.tsx` shows a **Run type** control near the summary: a select (base-ui, shadcn)
with Long run, Fast run, None, and a small hint under it: "Set automatically from your rules" or "Set by you", the
latter with a **Use my rules** button that sends `auto`. Changing it calls `training.setRunType`, shows an error toast
on failure, and invalidates `training.getActivity` and `training.getCalendar`.

## Coach

- `get-coach-context.service.ts` loads `getWeeklyGoals` instead of `getAvailability`.
- `build-coach-context.helper.ts` replaces the Availability section with **Weekly goals**: one line per set goal with
  this week's progress from `computeWeeklyGoalProgress` (for example `Long runs: 0 of 1 done`,
  `Running distance: 18.4 of 30 km done`), the days left, and the rule in one line. With no goal set:
  `No weekly goals set.` This section is never cut for length, like the other fixed sections.
- `activityLine` adds the run type for runs (`| long run` or `| fast run`).
- The `getAvailability` tool and its tests are removed. Activity tool results carry `runType` through the DTO.
- System prompt, weekly rules: runs typed `fast` count as hard runs, and when the athlete asks what to do, the coach
  takes the open weekly goals into account (for example suggest the missing long run as an easy Z2 run, while keeping
  the cap of 2 hard runs and no hard runs on consecutive days). Update the prompt test.

## Tests

- `classifyRun`: every row and example of the rules table, the boundaries (exactly 3 km, exactly 6 km, exactly
  5:00/km), elapsed time fallback, no distance, no time, custom rules.
- `computeWeeklyGoalProgress`: week boundaries (Monday and Sunday items, last week's items ignored), only `run` items
  for distance and types, only `strength` for strength, goals not set are absent, remaining never negative, `daysLeft`
  on Monday and Sunday.
- Validation helper, repositories (fake Supabase client: every query filters by `user_id`, every insert sets it),
  services (defaults when no row, reclassify only when a threshold changed, manual runs untouched), controllers.
- `setRunType`: each input value, a non run activity or another user's activity is not found.
- Import paths: an uploaded run and a Zepp run get the type from the athlete's rules; a Hyrox upload gets none.
- Coach context: the Weekly goals section and the run type in activity lines; no Availability section.
- UI: the Goals form (empty fields, km and pace conversion, threshold order error), the dashboard card per mode,
  empty state, done state, the activity page control.
- `db/tests`: `weekly_goals` RLS (owner only), the check constraints, the `activities` check, the migration's
  classification of seeded runs; availability cases and fixtures removed.

## Docs to update in the same change

[database.md](database.md), [athlete-races.md](athlete-races.md) (availability section replaced by goals),
[coach-chat.md](coach-chat.md), [dashboard-progress.md](dashboard-progress.md), [ux-design.md](ux-design.md) (the
`/settings` row), [architecture.md](architecture.md) and [README.md](README.md) (module descriptions), and the account
deletion copy in `delete-profile-section.tsx` and `account-data.repository.ts` ("availability" becomes "goals").

## Left to the builder

- The exact layout of the Goals form and of the card inside the existing design system.
- Whether the run type control sits in the summary header or in the details area of the activity page.
- Splitting the work into commits (a sensible order: migration and types, goals backend, run types backend, coach,
  Settings, dashboard card, activity page, availability removal).
