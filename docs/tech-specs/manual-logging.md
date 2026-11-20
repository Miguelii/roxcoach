# Manual logging

An uploaded file captures time, distance and heart rate. It does not capture Hyrox station results, loads or
strength sessions in a useful way. Manual logging fills that gap, and is also the way to record a
workout that has no file.

## What can be logged

| Item                             | Storage                                           | Notes                                                              |
| -------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| A whole manual session           | `activities` with `source = 'manual'`             | name, date, category, duration, optional distance and heart rate   |
| Hyrox station results            | `station_results`                                 | station, time, load, reps, distance                                |
| Strength sets                    | `strength_sets`                                   | exercise, set index, reps, load, RPE; Lyfta adds source ID and RIR |
| Effort and notes on any activity | `activities.perceived_effort`, `activities.notes` | works on uploaded activities too                                   |

Manual sessions appear in the calendar and are visible to the coach exactly like uploaded ones.

## Entry points

1. **Calendar, "Log session"** on a day: a dialog to create a manual `activities` row.
2. **Activity detail, "Add details"**: attach station results, strength sets, effort and notes to
   any activity (uploaded or manual).
3. **Station tagging**: on an uploaded activity with laps, the athlete can mark which laps are which
   stations. This writes `activity_laps.station` and is used when automatic detection did not apply
   .

## Forms

All forms use react-hook-form with zod in a colocated `use-<form>.ts` hook and shadcn components.

**Manual session**

| Field          | Rule                                              |
| -------------- | ------------------------------------------------- |
| Name           | required                                          |
| Date           | required, not in the future                       |
| Category       | `run`, `hyrox`, `strength`, `cross`, `other`      |
| Duration       | required, `h:mm:ss` or minutes, stored in seconds |
| Distance       | optional, km input stored in meters               |
| Avg heart rate | optional                                          |
| Effort (RPE)   | optional, 1 to 10                                 |
| Notes          | optional                                          |

**Hyrox stations** (shown when the activity category is `hyrox`): one row per station in race
order. Each row has time (`mm:ss`), load in kg, reps and distance, all optional but at least a time
or load per saved row. Default load and reps per station are prefilled from the athlete's division
in `hyrox.constants.ts`. Totals (sum of stations, sum of runs when laps exist) are shown live.

**Strength**: add exercises, then sets (reps, load, RPE). Exercise names autocomplete from the
athlete's previous exercises.

## Rules

- Saving replaces the full set of station results or sets for that activity in one transaction.
- Editing an uploaded activity never changes file-sourced columns (distance, times, heart rate).
  Only effort, notes, station results, strength sets and lap station tags are editable on them.
- Lyfta-imported activity fields and Lyfta-derived strength sets are read-only; only locally owned
  effort and notes can be edited.
- Manual strength sets leave `source_exercise_id` and `rir` null. Lyfta-origin weights are
  normalized to kilograms before storage.
- Deleting a manual session deletes its station results and sets (cascade). An uploaded activity
  cannot be deleted from the app.
- A manual session is read by the coach chat, same as an uploaded activity.

## Backend

Module `training`:

| File                                                                                                                                   | Purpose                                        |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `controllers/create-manual-activity.controller.ts`, `update-manual-activity.controller.ts`, `delete-manual-activity.controller.ts`     | manual sessions                                |
| `controllers/save-activity-details.controller.ts`                                                                                      | effort, notes, station results, sets, lap tags |
| `services/*.service.ts`                                                                                                                | validation and orchestration                   |
| `repositories/activities.repository.ts`, `activity-laps.repository.ts`, `station-results.repository.ts`, `strength-sets.repository.ts` | data access                                    |
| `helpers/hyrox-totals.helper.ts`                                                                                                       | station and run totals                         |

## Tests

Unit tests for the totals helper, the form schemas (invalid times, negative loads, future dates)
and the rule that file-sourced columns are never written by the update service.
