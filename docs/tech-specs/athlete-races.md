# Athlete and races

Two small modules (`athlete`, `races`) that capture the athlete's starting point and the races
that drive the plan. Everything the coach proposes is derived from these inputs.

## Athlete profile

Edited in Settings. One row in `athlete_profiles` (see [database.md](database.md)).

| Field              | Required | Used by                                                   |
| ------------------ | -------- | --------------------------------------------------------- |
| Display name       | yes      | app shell                                                 |
| Timezone           | yes      | `local_date` of activities, calendar days, scheduled jobs |
| Max heart rate     | no       | HR zone analysis in the weekly report                     |
| Resting heart rate | no       | same                                                      |
| Hyrox division     | no       | default for new Hyrox races, station loads                |
| Weekly hours cap   | no       | hard ceiling in plan generation                           |
| Notes              | no       | injuries and preferences passed to the coach verbatim     |

## Weekly availability

The athlete describes a typical week in Settings. Stored as `availability_slots`.

For each weekday the athlete can add one or more slots:

| Field        | Meaning                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Session kind | `hyrox`, `run`, `strength`, `cross` or `rest`                                                                        |
| Fixed        | on: a commitment that already exists (for example a Hyrox class every Tuesday). Off: an open slot the coach may fill |
| Max minutes  | upper bound for the session                                                                                          |
| Notes        | for example "lunch break only"                                                                                       |

Rules:

- A weekday with a `rest` slot cannot also have other slots (validated server-side).
- The same `(weekday, session_kind)` pair cannot appear twice.
- Fixed slots are planned as-is, with the coach adapting the load around them. Open slots are
  where the coach places the sessions it chooses.
- Changing availability does not regenerate anything immediately: the next Sunday report uses it,
  and "Generate now" on the Coach page applies it sooner (see [plan.md](plan.md)).

UX: a 7-column week editor with the slots as chips per day, an "Add slot" action per day, and a
summary line ("4 sessions per week, 6h max").

## Races

The athlete can add any number of races. Each has its own goal.

| Field       | Rules                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------- |
| Name        | required, for example `Hyrox Lisbon` or `S. Silvestre Guimaraes 10k`                        |
| Type        | `hyrox`, `running` or `other`                                                               |
| Date        | required, may be in the past only when status is `completed`                                |
| Location    | optional                                                                                    |
| Distance    | required for `running` (meters), hidden for `hyrox`                                         |
| Division    | required for `hyrox`, defaults to the profile division                                      |
| Target time | required, entered as `h:mm:ss`, stored in seconds. Examples: Hyrox `1:10:00`, 10k `0:39:59` |
| Priority    | `A`, `B` or `C`, default `A`                                                                |
| Status      | `upcoming`, `completed`, `cancelled`                                                        |
| Result time | optional, set when completing a race                                                        |
| Notes       | optional                                                                                    |

Goal examples that must be expressible: "Hyrox in 1h10" (target `1:10:00`) and "S. Silvestre 10k
sub 40 min" (target `0:39:59`). The app always shows the stored time, never rewrites it as "sub".

Priority meaning (used by the coach, see [plan.md](plan.md)):

| Priority | Treated as                                                 |
| -------- | ---------------------------------------------------------- |
| `A`      | The target of a full training block: peak and taper        |
| `B`      | A tune-up inside a block: short taper, still a real effort |
| `C`      | A training session: no taper, run as part of the load      |

Behaviour:

- The Races page lists upcoming races sorted by date with days remaining, then a collapsed
  history of completed ones.
- Creating, editing or cancelling an upcoming race is picked up by the next Sunday report, or
  immediately with "Generate now".
- Completing a race records `result_time_s`, shows goal versus result, and the coach comments on
  it in the weekly report if the race also exists as a synced activity (matched by `local_date`).
- A division is only valid on a `hyrox` race (validation rejects it otherwise). Blank location and
  notes are stored as NULL.
- Past dates are rejected on creation. Deleting a race with planned sessions detaches them
  (`race_id` set null) instead of deleting the sessions.

## Backend

Module `athlete`:

| File                                                                              | Purpose                                                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `controllers/get-profile.controller.ts`                                           | protected query                                                                                   |
| `controllers/get-timezone.controller.ts`                                          | protected query, the timezone string (default Europe/Lisbon); the dashboard derives today from it |
| `controllers/update-profile.controller.ts`                                        | protected mutation                                                                                |
| `controllers/get-availability.controller.ts`                                      | protected query                                                                                   |
| `controllers/save-availability.controller.ts`                                     | protected mutation, replaces the full week in one transaction                                     |
| `services/*.service.ts`                                                           | business logic and validation                                                                     |
| `repositories/athlete-profiles.repository.ts`, `availability-slots.repository.ts` | data access                                                                                       |

Module `races`:

| File                                                                                              | Purpose                           |
| ------------------------------------------------------------------------------------------------- | --------------------------------- |
| `controllers/list-races.controller.ts`                                                            | protected query, filter by status |
| `controllers/create-race.controller.ts`, `update-race.controller.ts`, `delete-race.controller.ts` | protected mutations               |
| `controllers/complete-race.controller.ts`                                                         | records the result                |
| `repositories/races.repository.ts`                                                                | data access                       |

The mutations do not call the coach. The plan page notices a change newer than the last report by
comparing `updated_at` timestamps.
