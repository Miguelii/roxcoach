# Dashboard progress

The dashboard becomes mode based: the athlete picks **Running** or **Strength**, the choice is saved
in the athlete profile, and the page shows progress charts for that mode. Status: implemented (migration `0015`, branch `feat/dashboard-progress`).

## Why

The athlete trains for running and Hyrox goals and also lifts. When opening the dashboard they want
to see, at a glance and without digging:

- Running: how their pace is evolving, how it relates to the goal of their next race, and how their
  pace behaves inside each heart rate zone (Z1 to Z5).
- Strength: whether the heaviest set of their most used exercises keeps going up.

Success means the athlete can answer "am I getting better, and am I on track for my goal?" in a few
seconds, on a phone, from charts that are readable first and pretty second.

## Goals

- A Running/Strength mode switch, persisted in `athlete_profiles`, in the desktop sidebar and in
  Settings (its own Dashboard tab). It is not on the dashboard page itself.
- Running mode, laid out like Strava: the days of this week, a headline for the week or month you
  are looking at (distance, time or runs, with the change from the previous one and a bar per
  week to pick another), the goal pace, the latest runs, then the pace trend with the goal pace
  as a reference line, pace by heart rate zone and average heart rate.
- Strength mode: first one card per exercise for the top 4 most used by default, one below the
  other, each with its picture, the latest top
  set (kg and its reps) and a chart of its top set over time with the reps of each top set as
  bars underneath (the top set is the heaviest set of the workout, more reps wins a tie on load;
  `points` carry `topSetKg` and `topSetReps`). A filter chooses one exercise instead (any of the 12
  most used), then the training volume and workouts per week (bars, full width). The dashboard has no data tables: every series is a chart.
- A shared time range (3 months, 6 months, 1 year) for both modes.
- Real time-in-zone data: heart rate zones come from the track points of the stored files, not from
  average heart rate.
- Works on a phone first, accessible (keyboard, screen readers, reduced motion), light and dark.

## Non-goals

- Hyrox specific charts (stations, splits). Hyrox activities are not part of the running charts. The Hyrox race itself does appear in Running mode through the race banner and readiness (below).
- Per-activity charts (heart rate curve, map, laps). That belongs to the activity detail page.
- Zoom, brush, export, or editing the zone model. Zones are fixed (see Heart rate zones).
- Showing the new data to the coach. The coach tools stay as they are; feeding them progress data
  is a possible follow-up.
- Automatic or background processing. The history is reprocessed once, by a script the owner runs.

## Anti-goals

- Charts that look good and cannot be read: no 3D, no heavy gradients, no pies, no decoration that
  hides the trend.
- Meaning carried by color alone, or by hover alone.
- A dashboard that jumps around while loading (every card reserves its height).
- Slowing down the first paint of the dashboard because of the chart library.

## Approaches considered

How to get heart rate zone data (the one decision that shaped the work):

| Approach                                         | Trade-off                                                                                       | Decision   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---------- |
| Compute from the stored files on every load      | No new storage, but reading and decoding dozens of files per visit is slow and costly           | Rejected   |
| Store time per zone, fixed at upload             | Small and fast, but zones are frozen: changing max or resting heart rate leaves stale history   | Rejected   |
| **Store an HR histogram per run, zones at read** | Same cost as the one above, but zones follow the current profile and the model can change later | **Chosen** |

The files are already stored (see [manual-upload.md](manual-upload.md), "Track points are not
stored ... re-parsed from the stored file"), so the history can be reprocessed without new uploads.

Chart library: **Recharts** (chosen by the athlete), loaded lazily.

## Data model

Migration `0015_dashboard_progress.sql` (follows the `0014` conventions, one transaction, ends with
the `schema_migrations` insert):

| Table              | Change                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `athlete_profiles` | `dashboard_mode text not null default 'run' check (dashboard_mode in ('run', 'strength'))`              |
| `activities`       | `hr_histogram jsonb null`. `null` means not computed yet; an empty `bins` array means computed, no data |

No new table, no new policy: the existing owner policies and grants cover the new columns (check the
column grants in `0001` while writing the migration). Update [database.md](database.md).

### HR histogram

```json
{
    "v": 1,
    "bins": [
        [152, 412.0, 1530],
        [153, 388.5, 1451]
    ]
}
```

Each bin is `[bpm, time_s, distance_m]`: the moving time and the distance covered at that heart rate.
Time has at most one decimal, distance is rounded to whole meters, bpm is an integer from 30 to 250.
A run has at most a few dozen bins. The shape is validated with zod when read; a value that does not
parse is treated as "not computed".

How it is built (pure helper `buildHrHistogram(samples)` in `_bff/modules/training/helpers`):

- Input: ordered track points `{ t, hr, distanceM?, speedMps? }`. Each parser (FIT records, TCX
  trackpoints, GPX with the heart rate extension) maps its points to this shape.
- For each pair of consecutive points the interval is attributed to the heart rate of the **later**
  point.
- An interval is skipped when: the time step is not positive, or larger than `MAX_SAMPLE_GAP_S`
  (10 s, a pause), or the heart rate is missing or outside 30 to 250, or the athlete is stopped
  (speed below `MIN_MOVING_SPEED_MPS`, 0.5 m/s).
- Distance of an interval is the difference of cumulative distance when both points have it,
  otherwise speed times the time step, never negative.
- An interval with neither a distance delta nor a speed is skipped (it would give a time with no
  distance, and pace needs both). Indoor files with heart rate only therefore have an empty
  histogram; outdoor runs carry distance and speed per record.
- The histogram is computed for every parsed activity that has heart rate data, whatever its
  category; only `run` activities feed the charts.

`ParsedActivity` gains `hrHistogram`; the upload service saves it with the activity row. Constants
live in `_bff/core/constants/hr-histogram.constants.ts`.

### Backfill

A service `backfillHistograms` plus a thin script in `tools/` (same conventions as
`tools/gemini-smoke.ts`): for every `parsed` file whose activity has `hr_histogram is null`,
download it from Storage, parse it, update the row. Idempotent and resumable (it only touches rows
still `null`), a file that fails is logged with the activity id and error code only (never file
content) and does not stop the run, and it prints counts at the end. The owner runs it once after
applying `0015`. Activities without a stored file (for example Lyfta workouts) keep `null`.

## Heart rate zones

Five zones from the **heart rate reserve** (Karvonen), using `max_hr` and `resting_hr` from the
profile: `bpm = resting + percent * (max - resting)`.

| Zone | Name      | From (reserve) |
| ---- | --------- | -------------- |
| Z1   | Recovery  | below 60%      |
| Z2   | Easy      | 60%            |
| Z3   | Moderate  | 70%            |
| Z4   | Threshold | 80%            |
| Z5   | Maximum   | 90%            |

A heart rate belongs to the last zone whose floor is at or below it, so Z1 includes everything under
60% and Z5 everything above 90% (including values over the stored max). The table lives in
`_bff/core/constants/hr-zones.constants.ts` with the pure function `zoneBoundsBpm(profile)` and
`zoneOfHeartRate(bpm, bounds)`, importable from the client for legends and tooltips.

Both `max_hr` and `resting_hr` are required. Without them the zone chart shows an empty state that
links to Settings; the pace trend does not depend on zones and still works.

## Backend

New tRPC procedures in the training module (protected controllers, services, repositories, pure
helpers, per the layering in [architecture.md](architecture.md)):

| Procedure                      | Input                              | Output                                      |
| ------------------------------ | ---------------------------------- | ------------------------------------------- |
| `training.getRunProgress`      | `{ range: '3m' \| '6m' \| '12m' }` | pace and zone series, KPIs, goal, readiness |
| `training.getStrengthProgress` | `{ range: '3m' \| '6m' \| '12m' }` | top exercises with their top sets over time |
| `athlete.setDashboardMode`     | `{ mode: 'run' \| 'strength' }`    | `{ status: 200 }`                           |

`athlete.getProfile` (`ProfileDTO`) gains `dashboardMode`. `updateProfile` never writes it, and
`setDashboardMode` never writes anything else. The dashboard reads the mode from the profile query
(verify whether it also carries the timezone; if so the dashboard stops using `getTimezone`).
Cross-module reads go through services: the training services call the athlete service for the
profile and the races service for the goal race.

### Exercise insights

Each exercise card with at least two workouts in the range shows a progress panel computed in the
client from its `points` (`exerciseInsights`): the change in load, reps and estimated 1RM (Epley,
sets of 1 to 12 reps) from the first to the latest workout, a verdict from the 1RM (up 2% or more
"Progressing", down 2% or more "Slipping", else "Holding steady"; none when a set is above 12 reps)
and how many workouts ago the best estimated 1RM was. Zero changes read "no change".

### Buckets

The range decides the resolution: `3m` and `6m` use ISO weeks (Monday start, existing
`week-dates.utils`), `12m` uses calendar months. Strength mode is always weekly: its `12m` is 52
ISO weeks (`rangeBounds(today, range, true)`), and its training volume and workouts charts are
stacked at full width so the weekly bars have room. A bucket is keyed by its first date.
The axis shows the short start date (`16 Nov`), and the tooltip title names the whole bucket:
`Week 47 · 16 to 22 Nov` (`30 Nov to 6 Dec` across a month) or `November 2026` (`bucketRangeLabel`). Buckets with
no data are present in the response with `null` values so the x axis is continuous.

### Running payload

- **Pace series**: per bucket, `paceSecPerKm = sum(moving_time_s) / (sum(distance_m) / 1000)` over
  `run` activities with distance and moving time, plus `distanceKm` and `runs`.
- **Zone series**: per bucket and zone, time and distance summed from the histograms, converted
  with the current profile bounds. `paceSecPerKm` per zone and `minutes`. A zone point is `null`
  when the bucket has less than `MIN_ZONE_SAMPLE_S` (300 s, 5 minutes) in that zone, so a few
  seconds do not draw a wild point.
- **Goal**: the next upcoming `running` race (priority A first, then the earliest date) with a
  distance. `paceSecPerKm = target_time_s / (distance_m / 1000)`, plus race name, date and days left.
  `null` when there is none (Hyrox races have no distance, so they never give a goal pace).
- **Heart rate**: `avgHrBpm` per bucket is the average heart rate of the runs counted in the pace,
  weighted by moving time (from `activities.avg_hr`); null without any heart rate.
- **Buckets** also carry `movingTimeS` (the headline's Time). The week dots and the recent runs
  come from the same calendar window as the week strip (35 days), not from this query.
- **KPIs**: average pace, total distance and number of runs in the range, and the difference of the
  recent pace (last bucket with data) against the goal pace.

### Strength payload

- **Top exercises**: an exercise is keyed by `source_exercise_id` when present, otherwise by its
  lower-cased, trimmed name; the displayed name is the most recent one. Ranked by the number of
  distinct workouts in the range, ties broken by total sets, then name. The first
  `MAX_EXERCISES` (12) are returned, so the dashboard has a list to choose from (it shows the
  top 4 by default).
- Per exercise and workout date: `topSetKg`, the highest `load_kg` among the sets with reps and a
  positive load. Dates with no usable set have no point, so a point is never null. Two workouts on
  the same date collapse to one point.
- **Buckets** (`granularity` and `buckets` of `StrengthProgressDTO`): per week or month, `volumeKg`
  (sum of reps times load over every set with reps and a positive load, all exercises), `workouts`
  (distinct workouts) and `sets`. Empty buckets are present.
- **Picture**: `imageUrl` is `exercise_image_url` of the most recent workout that has one (null
  when none does). The images are Lyfta URLs shown through `next/image` (the hosts are in
  `next.config` `images.remotePatterns`).
- There is no body weight series and no estimated 1RM: the dashboard does not use them.

All aggregation lives in pure helpers under `_bff/modules/training/helpers`, fed by repository
queries that always filter by `user_id`. Queries select only the columns they need and are bounded
by the range.

## Frontend

### Layout

```
Progress                                          [ 3M  6M  1Y ]   [Upload] [Sync]
A clear view of ...

[ week strip (unchanged, both modes) ]

Running mode (the order of a training app, like Strava)
+--------------------------------------------------------------------+
| This week                                              34.2 km     |
|  (M) (T) (W) (T) (F) (S) (S)   filled = ran, today ringed          |
+--------------------------------------------------------------------+
| [ Distance | Time | Runs ]                                         |
| THIS WEEK                                   [<] [>]                |
| 34.2 km        +5.1 km vs previous week                            |
|  bars, one per week, the selected one in the accent color          |
|  Distance 34.2 km | Time 3h 05m | Runs 4 | Avg pace 5:12 /km       |
+--------------------------------------------------------------------+
| (target) GOAL PACE 4:30 /km  Lisbon 10K, in 23 days   +0:42 /km    |
+--------------------------------------------------------------------+
| Recent runs                                                        |
|  Long run  Wed 18 Nov, 55m                     10.0 km  5:30 /km > |
|  ... (5 at most, each links to the run)                            |
+--------------------------------------------------------------------+
| Pace trend                                         faster is up    |
|  line + dashed goal line "Goal 4:30 (Lisbon 10K, in 23 days)"      |
+--------------------------------------------------------------------+
| Pace by heart rate zone     [Z1] [Z2] [Z3] [Z4] [Z5]  (toggles)    |
|  one line per zone, gaps where under 5 minutes                     |
+--------------------------------------------------------------------+
| Average heart rate (only with heart rate data)                     |
+--------------------------------------------------------------------+

Strength mode
| Top exercises (heading)                                            |
| +----------------------------------------------------------------+ |
| | [img]  Back squat                                  5 workouts  | |
| |  Latest top set            Best                                | |
| |  100 kg x 5 reps  +10 kg   105 kg x 5                          | |
| |   area chart of the top set of every workout (own axis) with   | |
| |   the reps of that set as soft bars underneath                 | |
| +----------------------------------------------------------------+ |
| | [img]  Bench press ... (one card per exercise, 4 by default)   | |
| +----------------------------------------------------------------+ |
| Training volume per week (full width bars)                         |
| Workouts per week (full width bars)                                |
```

On a phone: the title row, then the range (full width) and the actions; cards
stack in one column, the headline stats in a 2 by 2 grid, exercise cards one below the other (chart 176 px
high). From `md`: the headline stats in one row, chart 208 px high; from `lg` the exercise cards go in two
columns.

The week strip above the charts follows the mode: in strength mode there is no run distance tile,
and time and sessions count strength workouts only (the load ratio still uses every activity). In
running mode it is unchanged.

### Mode switch and range

- The mode switch is the existing `Tabs` (base-ui) as a segmented control, labels "Running" and
  "Strength", each at least 44 px tall on touch (smaller, with icons, in the sidebar). It lives in
  two places, both built from the same `DashboardModeSwitch` and wired by `DashboardModeToggle`:
  the bottom of the desktop sidebar (above the Log out button, under a "Dashboard" label), and a
  "Dashboard" section in its own Settings tab, apart from Profile so it is not mistaken for a
  profile field. The sidebar is hidden on a phone, so
  Settings is where a phone user changes it. It is saved as it is picked, apart from the profile
  form. Changing it updates the UI immediately (optimistic cache update) and calls
  `athlete.setDashboardMode`; on failure it reverts and shows a toast.
- The range is a second segmented control (3M, 6M, 1Y), kept in the URL with nuqs (`range`) so a
  refresh restores it. It is not saved in the profile. Default `12m`.
- The page prefetches on the server, behind one `Suspense` whose fallback is `DashboardContent`
  itself (not a skeleton): it reads the client cache, so a return visit within the cache lifetime
  shows the last data at once instead of a skeleton on every navigation, and with an empty cache it
  draws its own skeleton. Then the profile first (for the timezone and mode), then in parallel the week strip calendar
  window (`weekStripWindow(today)`, the last 35 days) and the progress query of the current mode
  for the `range` in the URL (parsed with the shared `PROGRESS_RANGE_PARSER`). The results reach
  the client cache through a `HydrationBoundary`, so the page opens with data and no client
  round-trip. A failed server read is left out of the cache and the client query fetches it with
  its own loading and error states.
- The shell's mode toggle creates the profile query before the page hydrates, so the hydrated
  profile only lands after commit. The page also passes the server profile to `DashboardContent`
  (`initialProfile`), which renders from it until the client query has data.
- Without a profile (server read failed and the client query is still loading), the page shows the
  dashboard skeleton (no flash of the wrong mode).

### Chart cards

One reusable card: title, one-line takeaway, optional controls, the chart, a footnote. Charts are
client components loaded with `next/dynamic` (`ssr: false`) with a skeleton of the same height, so
the week strip paints first and the chart library is not in the initial bundle. Each card owns its
own loading, error (with retry, `QueryError`) and empty state.

Empty states: no runs in the range ("Upload a run to see your pace"); zones need heart rate
settings (link to Settings); no race with a distance (the goal tile says "Add a running race to see
your goal pace", linking to Races); no strength data ("Sync Lyfta to see your progress", linking to
the Lyfta settings tab). A chart is always drawn when there is data, even with one or two points (a
dot or a short line); a chart with no data at all becomes an empty state with a way to fill it.

### Visual design

Follows BrewStock tokens ([ux-design.md](ux-design.md)): paper ground, white cards with hairline
borders, `display` headings, tabular numbers for every figure (`font-variant-numeric:
tabular-nums`). Chart colors are tokens (`var(--...)`), never raw hex, so dark mode follows
`theme-dark.css`.

| Series     | Token and treatment               | On white |
| ---------- | --------------------------------- | -------- |
| Pace trend | `--blue`, solid, round markers    | 7.6:1    |
| Goal pace  | `--tangerine`, dashed 6 4, label  | 4.5:1    |
| Z1         | `--slate`, solid, circle marker   | 8.1:1    |
| Z2         | `--blue`, solid, square marker    | 7.6:1    |
| Z3         | `--green`, solid, diamond marker  | 4.4:1    |
| Z4         | `--tangerine`, solid, triangle    | 4.5:1    |
| Z5         | `--tangerine-deep`, dashed, cross | 8.2:1    |
| Exercise 1 | `--blue`, solid, circle marker    | 7.6:1    |
| Exercise 2 | `--green`, solid, square marker   | 4.4:1    |
| Exercise 3 | `--tangerine`, solid, diamond     | 4.5:1    |
| Exercise 4 | `--slate`, solid, triangle        | 8.1:1    |
| Exercise 5 | `--tangerine-deep`, dashed, cross | 8.2:1    |

`--amber` (1.9:1 on white) is not used for data. The contrast of every series against the card is
verified in light and dark (3:1 minimum for lines, 4.5:1 for text) during implementation.

Chart rules:

- One chart answers one question. Lines for trends, no pies, no 3D. Grid lines are low contrast.
- The pace axis is reversed (faster is higher) and says so ("faster is up"), because a falling
  number is an improvement and the picture must match the feeling.
- Zones are never told apart by color alone: each has its own dash style and marker, and the legend
  items are toggle buttons (at least 44 px tall on touch) that show and hide a zone.
- Values are readable without hovering: the cards show latest value and change; tooltips are a bonus
  on hover and on tap.
- A change is shown with a sign and an arrow icon plus text ("+5 kg"), never by color alone. An
  exercise card hides its change when the top set did not move or there is only one workout.
- Pace is formatted `m:ss /km`, loads in kg with at most one decimal, dates in the athlete's
  locale-neutral short form. Reuse the existing formatters; add a seconds-per-km pace formatter next
  to `formatPace` (which takes meters per second) instead of duplicating.

### Accessibility and motion

- Each chart is `role="img"` with an `aria-label` summarising its message ("Average pace improved
  from 5:30 to 5:12 per kilometre over 6 months"). The athlete asked for charts and no tables, so
  there is no table fallback; the tooltip carries the exact value of every point.
- Recharts `accessibilityLayer` is on, so the chart is reachable and navigable by keyboard.
- Animations are off when `prefers-reduced-motion` is set; otherwise at most one short entrance
  (under 400 ms, ease-out).
- Focus rings stay visible; touch targets are at least 44 px; no horizontal page scroll at 375 px.
- Card heights are fixed (chart 240 px on phone, 280 px from `md`) so loading does not shift layout.

## Cache and refresh

Both progress queries and the dashboard's profile query use the dashboard stale time, so data
hydrated from the server is not refetched as soon as the page mounts. Uploading an activity and syncing Lyfta already
invalidate the training queries; add `training.getRunProgress` and `training.getStrengthProgress`
to those invalidations. Changing `max_hr` or `resting_hr` in Settings invalidates
`training.getRunProgress` (the zones follow the profile, which is the point of the histogram).
The cache is cleared on logout as today.

## Testing

- Pure helpers, unit tested: `buildHrHistogram` (pause gaps, stopped intervals, missing heart rate,
  cumulative distance versus speed), zone bounds and `zoneOfHeartRate` (edges, values above max),
  bucketing (week and month), pace aggregation, zone aggregation with the minimum sample rule, goal
  selection, top exercise ranking and tie breaks, top set per date, exercise picture.
- Parsers: each of FIT, TCX and GPX returns a histogram for its fixture, and `null`-safe output for
  a file without heart rate.
- Services with a fake Supabase client; the backfill service with fake storage; repositories check
  the `user_id` filter.
- PGlite SQL tests: the new columns, the check constraint on `dashboard_mode`, RLS unchanged.
- Components: week dots, headline, goal card, recent runs, cards, empty states, and the mode switch (optimistic update and revert),
  always located by `data-testid`. SVG drawing is not asserted; tests read the frames with their
  `aria-label` summaries, the takeaways, the legends and the empty states.

## Documents to update in the same change

[database.md](database.md) (columns), [athlete-races.md](athlete-races.md) (`dashboardMode`, zones
use `max_hr` and `resting_hr`), [manual-upload.md](manual-upload.md) (histogram in the pipeline,
backfill), [ux-design.md](ux-design.md) (the Dashboard section and its "charts are a follow-up"
sentence), [architecture.md](architecture.md) (module map and procedures), and the index in
[README.md](README.md).

## Known limitations

- Runs without a stored file, or whose file has no heart rate, count in the pace trend but not in the
  zone chart.
- Zones use the profile as it is today, for every date in the range; the athlete's fitness changes
  are not modelled.
- Hyrox activities are excluded from the running charts even when they contain running.
- Exercises are matched by Lyfta's exercise id or by exact normalized name, so a renamed exercise can
  split into two series.

## Calls made by the author (to be checked)

- Karvonen zones with fixed floors (60, 70, 80, 90%) and both heart rates required.
- `3m` and `6m` weekly, `12m` monthly; default `12m`; range kept in the URL, not in the profile.
- Zone points need 5 minutes of data; intervals over 10 s apart or slower than 0.5 m/s are dropped.
- Goal pace comes from the next upcoming running race (priority A first).
- Top 4 exercises by number of workouts by default, each in its own card with its own axis (loads
  differ too much for one shared chart). Its chart is drawn from one workout on.
- The exercise filter is a dropdown on a wide screen (`Select`, first option "Top 4", then every
  exercise) and, on a phone, a full-width button that opens a bottom drawer with the same list
  (rows at least 56 px tall, picture, name, workouts, a check on the current one): no dropdown on a
  phone. Choosing an exercise shows only its card (full width); "Top 4" goes back. The choice is
  not saved; if the chosen exercise is not in the data of another range, it falls back to the top.
- The week strip stays in both modes; in strength mode it drops the run distance tile and counts
  strength workouts only for time and sessions.

## Race readiness

Design: `docs/superpowers/specs/2026-11-21-race-readiness-design.md`. Running mode opens with a race
banner and a readiness card for the next race, Hyrox included.

- **Next race**: `pickNextRace` takes the upcoming races that are Hyrox or running with a distance,
  priority A first, then the earliest date, then the name. It feeds `readiness`, while `goal`
  (the goal pace card) keeps using `pickGoalRace`.
- **Race pace** (`racePaceSPerKm`): distance and goal time when the race has a distance; for a Hyrox,
  the run pace table by goal time (`HYROX_RUN_PACE_TIERS`: 60:00 is 3:58, 75:00 is 4:55, 90:00 is
  5:55, 105:00 is 6:53 per km) with linear interpolation and the nearest tier outside it.
- **Pace histogram**: see [manual-upload.md](manual-upload.md). Runs without it (not backfilled)
  give `No data` on the Pace row.
- **Rules** (constants in `race-readiness.constants.ts`), over the last 28 days:
    - Load: `no_data` without runs. `attention` when the acute:chronic run distance ratio is outside
      0.8 to 1.3 or, when heart rate zones exist, the share of time in Z1 and Z2 is under 70%;
      otherwise `on_track`.
    - Pace: a fast session is a run with at least 180 s in pace bins entirely faster than the race
      pace. `on_track` from 3 fast sessions, otherwise `attention`; `no_data` when no run in the
      window has a pace histogram.
    - Taper: with 7 days or less to the race, `on_track` and `attention` become `taper`.
- **Payload**: `RunProgressDTO.readiness` is `null` without a next race or a race pace. It carries
  the race summary and the numbers behind both rows (weekly km and its change, ratio, easy share,
  fast sessions and fast time); the wording is built in the frontend (`readiness-utils.ts`).
- **UI**: `RaceBanner` (days to go, date, priority, goal, race pace, links to `/races`) and
  `RaceReadinessCard` (Load and Pace rows, each with a state label and icon and a reason) sit above
  the week dots, also before the first run.
