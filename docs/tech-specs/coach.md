# Coach

The coach has one job: **every Sunday evening, 20:00 Lisbon time, it writes a weekly report**. The report reviews the
week that is ending, remembers what the previous reports said (up to 3), and proposes the sessions
for the next week. There is no per-workout feedback and no chat in v1.

Like BrewStock's analysis flow, the design is deliberately simple: one model call per report,
structured output validated with zod, and quality comes from the breadth and accuracy of the
context. No agent loop.

This document is the single source of truth for everything the model sees. Update it in the same
change whenever a context block, prompt or output shape changes.

## Schedule and triggers

| Trigger                                    | Behaviour                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Schedule, every Sunday 20:00 Europe/Lisbon | `generate-weekly-report` job for the ISO week that is ending, one run per user with access |
| "Generate now" on the Coach page           | same job for the current week, allowed any day, replaces an existing report of that week   |
| First week with no history                 | a normal report with no memory block                                                       |

A report is keyed by `(user_id, week_start)`, so a rerun of the same week updates the row.

### The cron job

The schedule is a `pg_cron` job in the shared Supabase database, not a Trigger.dev schedule. `pg_cron`
on Supabase runs in **UTC whatever the project region is** (the database being in France does not
make it run in French time; confirm with `show timezone;` and the `cron.timezone` setting). Lisbon
is UTC in winter and UTC+1 in summer, so one fixed UTC hour would drift by an hour twice a year.
The spec avoids that with two entries and a gate:

| Piece        | Spec                                                                                                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cron entries | `roxcoach-weekly-report-a` at `0 19 * * 0` and `roxcoach-weekly-report-b` at `0 20 * * 0` (UTC)                                                                                                                                                                      |
| Action       | `pg_net` HTTP `POST` to `/api/cron/weekly-reports` with `Authorization: Bearer <CRON_SECRET>`, the secret read from Supabase Vault, never written in the cron command                                                                                                |
| Gate         | the route computes the current time in `Europe/Lisbon` (the `REPORT_TIMEZONE` constant). Only when it is Sunday and the hour is 20 does it continue, otherwise it returns `200` and does nothing. In winter entry `b` acts and `a` is a no-op, in summer the reverse |
| Fan-out      | for each user with access (see [auth-security.md](auth-security.md)) that has no `ready` or `generating` report for the ending week, trigger one `generate-weekly-report` run with `{ userId, weekStart }`                                                           |
| Auth         | the route compares the bearer token with `CRON_SECRET` in constant time and returns `401` otherwise. It sits outside the session proxy (the matcher excludes `api/`)                                                                                                 |
| Names        | job names are prefixed `roxcoach-` because the database is shared with another app                                                                                                                                                                                   |

The gate makes both entries safe to run, and the unique `(user_id, week_start)` row makes a double
trigger a no-op. A missed run (outage) is recovered with "Generate now". The athlete's profile
timezone is still used for `local_date`, but the report schedule is the single Lisbon time for
everyone.

If the athlete has no activities that week the report is still generated: it says the week was
empty, asks why when it is not a planned rest week, and proposes a restart week.

## Memory: the previous 3 reports

When generating the report for week N, the context includes the reports of weeks N-1, N-2 and N-3
(fewer when they do not exist). Selection is by `week_start` descending, status `ready`, limited
to 3, and never includes the report being generated.

What is carried is the **structured content**, not the raw activities of those weeks:

| Carried field                                    | Why                                                                     |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Week label and headline                          | orientation                                                             |
| Summary paragraph                                | the coach's own previous reading of the week                            |
| Key numbers (time, sessions, run km, load ratio) | trend across 4 weeks                                                    |
| `watch_out` items                                | open concerns to follow up on                                           |
| `next_week_focus`                                | what the coach asked the athlete to do, so the next report can check it |
| Adherence (planned versus done)                  | whether the proposals were followed                                     |

The model is told to check each earlier concern and focus against the new week and to say
explicitly whether it is resolved, still open or worse (the `follow_ups` output field). The memory
is a rolling window: week N+1 drops the oldest report and adds report N.

## Calls

| Output        | Job                      | Model input                           | Stored in                            |
| ------------- | ------------------------ | ------------------------------------- | ------------------------------------ |
| Weekly report | `generate-weekly-report` | system prompt + context blocks A to G | `weekly_reports`, `planned_sessions` |

Model: Anthropic through the AI SDK. The model id is one constant in
`src/_bff/modules/coach/constants/index.ts` (default `claude-sonnet-5-5`), recorded on every stored
row together with `prompt_version`.

All computation is done in code. The model receives numbers that are already calculated (paces,
weekly totals, ratios) and is told not to recompute them. It never sees raw activity files.

## Context blocks

Built by pure helpers in `src/_bff/modules/coach/helpers/build-*.helper.ts`, each returning a
plain-text block with a fixed heading. Missing data is omitted (never printed as "N/A"), and a
block with no data is dropped.

| Block | Heading             | Source                                                                               |
| ----- | ------------------- | ------------------------------------------------------------------------------------ |
| A     | Athlete             | `athlete_profiles`                                                                   |
| B     | Weekly availability | `availability_slots`                                                                 |
| C     | Races               | `races`                                                                              |
| D     | This week           | `activities`, `activity_laps`, `station_results`, `strength_sets` of the report week |
| E     | Plan adherence      | `planned_sessions` of the report week against `activities`                           |
| F     | Load trend          | `activities`, last 5 weeks                                                           |
| G     | Previous reports    | up to 3 `weekly_reports`, most recent first                                          |

### A. Athlete

Name, timezone, division, max and resting heart rate, weekly hours cap, free-text notes. Notes are
included verbatim (injuries, preferences) and labelled as athlete-provided.

### B. Weekly availability

One line per weekday: fixed commitments first, then open slots, each with kind and max minutes.
Example: `Tue: FIXED hyrox (60 min). Thu: OPEN run (max 50 min). Mon: rest`.

### C. Races

Upcoming races by date: name, type, date, weeks remaining, distance or division, goal time, the
required average pace for running races, priority. The last completed race with goal versus
result when present.

### D. This week

One entry per activity, in date order: date, name, category, source, duration, distance, average
pace for runs (`m:ss /km`), average and max heart rate, effort (RPE) when present, notes. For each
activity with laps: the lap table (index, distance, time, pace, heart rate, station tag) and the
derived values below. Hyrox activities include station results and the run versus station time
split. Strength activities include a summary (exercises, sets, top set).

| Derived value        | Definition                                                              |
| -------------------- | ----------------------------------------------------------------------- |
| Pace drift           | pace of the second half versus the first half, in percent               |
| Heart rate drift     | average heart rate of the second half versus the first half, in percent |
| Run vs station split | total run time and total station time (Hyrox)                           |

### E. Plan adherence

Each planned session of the week with its status (`done`, `skipped`, missed) and, when done, the
matched activity with its actual duration against the target. Totals: sessions done of planned,
minutes done of planned.

### F. Load trend

Computed by `compute-load.helper.ts` for each of the last 5 weeks, the report week included:
minutes, sessions, run km, and the acute to chronic ratio at the end of the week. Also: days since
the last rest day and the longest run in 28 days.

### G. Previous reports

Up to 3 reports as described in "Memory". Each is rendered as a compact text block with its week
label and the carried fields.

## System prompt

One file, `src/_bff/modules/coach/prompts/weekly-report.prompt.ts`, with a `PROMPT_VERSION`
constant. Rules:

- Role: a direct, precise endurance and Hyrox coach writing the weekly report. Quiet, specific, no
  hype, no emojis. English.
- Use only the provided numbers. If something is missing, say so briefly instead of guessing.
- Every claim about the week names at least one number from the data.
- Review each earlier concern and focus from the previous reports and report its status.
- Never give medical advice. If the notes or the data suggest injury or overtraining (acute to
  chronic ratio above 1.5, several weeks without a rest day), recommend reducing load and seeing a
  professional.
- Propose next week's sessions inside the availability: fixed slots are kept as they are, open
  slots are used up to the weekly hours cap, rest days stay empty. Follow the periodization rules
  in [plan.md](plan.md), which are included in the prompt as text.

## Output shape

Structured output with zod in `src/_bff/modules/coach/types/index.ts`.

```ts
type WeeklyReportOutput = {
    headline: string // one sentence, max 160 characters
    summary: string // 3 to 5 sentences reviewing the week
    wentWell: string[] // 1 to 4 items
    watchOut: string[] // 0 to 3 items
    followUps: Array<{
        // one per earlier concern or focus carried in memory
        topic: string
        status: 'resolved' | 'open' | 'worse'
        note: string
    }>
    nextWeekFocus: string // what the athlete should concentrate on, 1 to 2 sentences
    raceOutlook: Array<{
        // one per upcoming race within 16 weeks
        raceId: string
        weeksToGo: number
        note: string // where the athlete stands against the goal and the plan for the block
    }>
    goalCheck: string | null // only when a goal looks unrealistic against recent data
    sessions: Array<{
        // next week, Monday to Sunday
        date: string // YYYY-MM-DD
        kind: 'hyrox' | 'run' | 'strength' | 'cross'
        title: string
        description: string // what to do, effort and pacing
        targetMinutes: number
        raceId: string | null
    }>
}
```

Post-processing, in code and never delegated to the model:

- Trim, drop empty items, cap list lengths, reject an empty headline or summary (the job retries
  once, then marks the report `failed` without writing sessions).
- Validate each session: the date is inside next week, not on a `rest` weekday, the kind matches an
  availability slot of that weekday, total minutes are within the weekly hours cap, and no two
  sessions share a day unless both slots exist. Invalid sessions are dropped, and the job fails
  loudly when more than 20 percent were invalid.
- Metrics (time, sessions, run km, load ratio) shown on the report come from code, not from the
  model output, and are stored next to it.

## Idempotency

| Item             | Rule                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Report           | one row per `(user_id, week_start)`. Re-running replaces the content and the `planned_sessions` of the following week that are still `planned` |
| Planned sessions | written with the report in one transaction. Sessions already `done` or `skipped` are never touched                                             |
| Prompt changes   | bump `PROMPT_VERSION`. Old reports keep their version and are not regenerated                                                                  |
| Memory           | recomputed on every run from the stored reports, so a replaced report changes what later reports remember only when they are generated again   |

## Failure handling

- The model call retries on transient errors and rate limits with backoff. A schema failure after
  one retry marks the report `failed` with a safe error message (never the full prompt) and the
  Coach page shows it with a "Generate now" retry.
- A missed Sunday (job failure, outage) is covered by "Generate now". The schedule does not try to
  backfill several weeks.
- The memory skips reports with status `failed` and takes the next older `ready` ones.

## Backend files

| File                                                                                                                                                                                                              | Purpose                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `controllers/list-reports.controller.ts`, `get-report.controller.ts`, `generate-report-now.controller.ts`                                                                                                         | tRPC routes                                         |
| `services/generate-weekly-report.service.ts`                                                                                                                                                                      | orchestration: gather context, call the model, save |
| `services/get-report-memory.service.ts`                                                                                                                                                                           | selects the previous 3 ready reports                |
| `processors/call-coach-model.processor.ts`                                                                                                                                                                        | the single model call with schema validation        |
| `helpers/build-athlete-context.helper.ts`, `build-week-context.helper.ts`, `build-memory-context.helper.ts`, `compute-load.helper.ts`, `compute-activity-metrics.helper.ts`, `validate-report-sessions.helper.ts` | context blocks, metrics, validation                 |
| `prompts/weekly-report.prompt.ts`                                                                                                                                                                                 | system prompt and `PROMPT_VERSION`                  |
| `repositories/weekly-reports.repository.ts`                                                                                                                                                                       | data access                                         |
| `jobs/generate-weekly-report.job.ts`                                                                                                                                                                              | Trigger.dev scheduled task and on-demand task       |

The `plan` module owns `planned_sessions`. The coach writes them through `plan`'s
`services/save-report-sessions.service.ts`, never through its repository.

## Tests

Unit tests with fixed fixtures for: the memory selector (fewer than 3 reports, a failed report in
the middle, the current report excluded, ordering), the memory context builder (carried fields
only, no `N/A`), the load computation (no history, one week of history), pace and drift, the
session validator (rest day, over cap, date outside next week, kind not in availability), and the
output post-processing. The model call itself is mocked at the processor boundary.
