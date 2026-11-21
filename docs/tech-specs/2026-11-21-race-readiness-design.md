# Race readiness on the Running dashboard (design)

Status: proposed, waiting for approval. Scope: the Running dashboard only. Strength mode is out.

## Intent and why

The dashboard looks back well ("am I improving?") but says nothing about the next event. The athlete
wants to open the Running dashboard and see, for the next race (Hyrox included):

1. how many days are left, like the banner the dashboard had before (`NextRaceView`, removed), and
2. whether their training is on track for it.

"On track" has two parts, in the athlete's own words:

- **Load**: enough volume with a sensible progression. Many easy Z2 runs count in favor.
- **Pace**: runs and sprints faster than race pace. The athlete does not train at race pace all the
  time, so a run at exactly race pace is not the signal; faster work is.

## Goals

- A **race banner** at the top of Running mode: race name, date, days left, goal time, priority, and
  the race pace. Links to `/races`. Renders nothing without an upcoming race.
- A **readiness card** under the banner with two verdict rows, Load and Pace, each with a short
  reason built from real numbers and a state: `On track`, `Needs attention` or `No data`.
- A **race pace** for every kind of race: from distance and goal time for running races, from a
  constant pace table for Hyrox (below).
- Per-run **pace histogram** stored like the heart rate histogram, so sprint work is detected in any
  workout, with or without laps.

## Non-goals

- Strength mode (nothing changes there).
- Hyrox stations or whole-Hyrox sessions. Hyrox sessions live in Strava as free activities and are
  not imported as laps. Only runs count.
- A training plan, workout suggestions or coach (LLM) verdicts. The verdict is rule based.
- Division specific Hyrox paces (doubles, Pro). One generic table to start.
- Changing the existing progress charts.

## Anti-goals

- A verdict that cannot be explained. Every state shows the numbers behind it.
- Punishing a run at easy pace: faster-than-race-pace time is the only pace signal.
- A scary red state with no data. Missing data is `No data`, never `Needs attention`.
- Slower first paint of the dashboard or a layout that jumps (reserve the card height).

## Approaches considered

How to detect work faster than race pace (the decision that shaped the work):

| Approach                      | Trade-off                                                                                              | Decision   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| A. From laps                  | No migration, but only sees intervals the watch marked as laps                                         | Rejected   |
| **B. Pace histogram per run** | Sees sprints in any workout. One migration and one reprocessing of the history, a pattern already used | **Chosen** |
| C. Run level averages only    | Nothing new, but an easy run and a sprint session look alike                                           | Rejected   |

How to get a Hyrox race pace: from the athlete's Hyrox history (needs laps, which the athlete does
not import) or a constant pace table keyed by goal time (**chosen**, the athlete supplied the table).

## Race pace

New constant in `src/_bff/core/constants/` (importable from the client), keyed by goal tier, seconds
per km of run pace in a Hyrox:

| Goal (tier time) | Run pace |
| ---------------- | -------- |
| 60:00            | 3:58     |
| 75:00            | 4:55     |
| 90:00            | 5:55     |
| 105:00           | 6:53     |

Pure helper `racePaceSPerKm(race)`:

- Race with a distance (running): `targetTimeS / (distanceM / 1000)`. Not the table.
- Hyrox race: linear interpolation of the table on `targetTimeS`; below the first tier or above the
  last the nearest tier is used (clamped). Example: 1:10:00 gives about 4:36 /km.
- Anything else (no distance, not Hyrox): `null`, and the readiness card is not shown.

## Pace histogram

- Column `activities.pace_histogram jsonb null`, same rules as `hr_histogram`: `null` is not computed
  yet, an empty `bins` array is computed with no data. Next migration after `0015`, one transaction,
  ends with the `schema_migrations` insert, `database.md` updated.
- Shape `{ "v": 1, "bins": [[paceSPerKm, time_s, distance_m], ...] }`, validated with zod on read
  (an invalid value counts as not computed). Bin width `PACE_BIN_S` (5 s/km), paces clamped to a
  sane range (builder to pick, for example 2:30 to 10:00 /km), faster or slower samples fall in the
  edge bins.
- Built by a pure helper next to `build-hr-histogram.helper.ts`, in the same parse pass, with the
  same interval rules (later point owns the interval, skip pauses, stops and intervals without
  distance and speed). Needs distance or speed, not heart rate, so indoor runs with no distance
  produce an empty histogram.
- `ParsedActivity` gains `paceHistogram`, saved with the activity at upload. The existing backfill
  service and the `tools/` script also fill `pace_histogram is null`, idempotent and resumable. The
  owner runs it once after the migration. Activities without a stored file keep `null`.

## Readiness rules

All numbers are computed on the server from `run` activities and live in constants
(`RACE_READINESS` or similar). The thresholds below are proposals to tune.

**Window**: the last 4 weeks (28 days) ending today, compared with the 4 weeks before it.

**Load** (needs at least one run in the window, else `No data`):

- Weekly run distance average of the window against the previous window, plus the existing
  acute:chronic load ratio (`computeLoadRatio`).
- Easy share: time in Z1 and Z2 divided by time in all zones, from the HR histograms with the
  current profile bounds. Skipped when max and resting heart rate are not set or there is no
  histogram data.
- `On track`: ratio between 0.8 and 1.3 and, when known, easy share at least 70%.
- `Needs attention`: ratio above 1.3 (ramping too fast), below 0.8 (volume dropping) or easy share
  below 70%. The reason names which one.

**Pace** (needs at least one run with a pace histogram in the window, else `No data`):

- A **fast session** is a run with at least `MIN_FAST_S` (180 s) of time at a pace faster than the
  race pace, summed over bins strictly faster than it.
- `On track`: at least 3 fast sessions in the window. `Needs attention`: 0 to 2, the reason says how
  many and the race pace.
- Also shown as info: total time faster than race pace in the window.

**Taper**: in the last 7 days before the race both rows keep showing the numbers but the state is
neutral (`Taper`, no warning), since less volume is expected.

## Backend

- A new field `readiness` on the `training.getRunProgress` payload (or a small separate procedure if
  it keeps the payload cleaner; builder decides). Contains the race summary used by the banner, the
  race pace, and the two verdicts with their numbers and reasons. `null` when there is no upcoming
  race or no race pace.
- Target race: the next upcoming race, priority A first then the earliest date (reuse
  `pick-goal-race.helper.ts` rules, extended so Hyrox races are eligible).
- Pure helpers under `_bff/modules/training/helpers` (readiness, pace histogram), repository queries
  filter by `user_id` and select only what they need, cross-module reads go through services. No
  new table or policy; the new column falls under the existing owner policies.

## Frontend

```
+--------------------------------------------------------------------+
| (flag) HYROX LISBOA   Sat 4 Jan   41 days to go   Goal 1:10:00     |
|        Race pace 4:36 /km                      A: Target race   >  |
+--------------------------------------------------------------------+
| READY FOR THE RACE                                                 |
| Load  ON TRACK       38 km/week, +6% vs the 4 weeks before,        |
|                      71% of the time in Z1 and Z2                  |
| Pace  NEEDS ATTENTION 2 runs faster than 4:36 /km in 4 weeks,      |
|                      aim for 3                                     |
+--------------------------------------------------------------------+
| (existing Running layout, unchanged)                               |
```

- The banner comes back from git history (`NextRaceView`, commit `e954b9d`) restyled with the
  current design tokens, in Running mode only. Component placement and the shared dialog and drawer
  rules in `CLAUDE.md` apply.
- The readiness card has a reserved height while loading and a clear empty state per row. Each state
  uses an icon and text, not color alone.
- The existing goal pace card keeps its job for running races. The builder decides whether it is
  folded into the banner to avoid showing the same race pace twice.

## Constraints

- Tech specs are binding: update `dashboard-progress.md` (remove the Hyrox non-goal, add this),
  `database.md`, `manual-upload.md` (pace histogram), `ux-design.md` and `architecture.md` where
  they change.
- English everywhere, no em-dashes, `@/` imports, `_bff` never imports from the frontend, types at
  the top of files, tests locate by `data-testid`.

## Decided by the athlete

- Scope: Running dashboard only, Hyrox events included as part of Running.
- Load and Pace as the two judgments, with faster-than-race-pace work as the pace signal.
- Race pace from a constant table for Hyrox, not from imported Hyrox sessions.
- Approach B (pace histogram).

## My calls (to check)

- Interpolating between tiers and clamping outside them.
- The 4 week window, thresholds (ratio 0.8 to 1.3, easy share 70%, 3 fast sessions of 3 minutes)
  and the Taper state.
- Rule based verdicts, no coach or LLM.
- Banner in Running mode only, one generic pace table.

## Left to the builder

Pace bin range, exact constant names and files, whether `readiness` extends `getRunProgress` or is
its own procedure, whether the goal pace card merges into the banner, wording of the reasons, and
the migration number.
