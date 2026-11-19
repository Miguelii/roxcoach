# Training plan

The `plan` module stores the sessions the coach proposes and matches them against what the athlete
actually did. The plan is a **rolling week**: every Sunday the weekly report (see
[coach.md](coach.md)) writes the sessions for the next 7 days. There is no separate long-range
generation.

## Plan model

| Concept         | Table                         | Notes                                                                                  |
| --------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| Planned session | `planned_sessions`            | one per day-slot, linked to the report that proposed it and optionally to a race       |
| Outlook         | `weekly_reports.race_outlook` | per race, where the athlete stands and how the block continues. Rewritten every Sunday |

The Plan page therefore shows the current week and the next one as firm sessions, plus the
coach's outlook toward each upcoming race (provisional, not scheduled day by day).

## Periodization rules

These rules are passed to the model as text and enforced where possible by the validator in code.
They shape the one week proposed, using the outlook of the earlier reports to stay consistent.

| Rule                    | Value                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Block structure         | build weeks, a recovery week every 4th week at about 70 percent of the previous week's volume, then peak, then taper       |
| Weekly load progression | at most 10 percent over the previous week's minutes, except after a recovery week                                          |
| Taper before an A race  | 7 to 10 days for Hyrox, 5 to 7 days for a 10k, shorter for shorter races. Volume drops, a few short race-pace efforts stay |
| Race week               | no hard session in the last 2 days, one short activation session 2 days before                                             |
| B races                 | 2 to 3 days of reduced load before, 1 to 2 easy days after. The block continues                                            |
| C races                 | planned as a hard session inside the week, no taper                                                                        |
| After a race            | the next 2 to 4 days are rest or easy, scaled to race length                                                               |
| Hard sessions           | at most 2 per week for running, never on consecutive days                                                                  |
| Availability            | fixed slots are kept as they are. Open slots are used up to the weekly hours cap. `rest` days stay empty                   |
| Race conflicts          | two races within 10 days: the lower priority race is demoted to a tune-up inside the taper of the higher one               |

Because only one week is written at a time, the model gets the weeks remaining to each race and the
recovery-week position (computed in code from the last 5 weeks of load) so the rules above still
work across weeks.

Session content by race type:

| Race                      | Session types the coach draws from                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hyrox                     | easy and long runs, tempo and interval runs at race pace, station work, compromised running (run after a station), full or half simulations, strength |
| Running (for example 10k) | easy and long runs, tempo, intervals at goal pace, strides, optional strength                                                                         |

Race-pace targets come from the goal: for a running race, `target_time_s / distance` gives the goal
pace, and the prompt derives easy, tempo and interval paces from it using fixed offsets defined in
`src/_bff/core/constants/pace.constants.ts`. For Hyrox, the target time is split between eight runs
and eight stations using the division reference in `hyrox.constants.ts`, and the prompt states the
run pace the goal requires.

If the goal looks unrealistic against recent data (for example a goal pace more than 8 percent
faster than the best recent comparable effort), the report's `goal_check` says so clearly and the
dashboard shows it. The coach never silently changes the goal.

## When sessions change

| Trigger                          | Behaviour                                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sunday 20:00 report              | writes next week's `planned` sessions                                                                                                                                 |
| "Generate now" on the Coach page | rewrites the `planned` sessions of next week from the new report                                                                                                      |
| Race or availability edited      | nothing is regenerated immediately. The Plan page shows a "Plan was written before this change" note, and the next report picks it up. "Generate now" is the shortcut |
| Activity synced                  | only matching, no generation                                                                                                                                          |

The report never edits past days or sessions marked `done` or `skipped`.

## Matching activities to planned sessions

Run after every activity sync or manual save (`match-activity-to-session` service):

1. Candidates are `planned` sessions on the activity's `local_date`.
2. A candidate matches when its kind maps to the activity category (`run` to `run`, `hyrox` to
   `hyrox`, `strength` to `strength`, `cross` to `cross`).
3. With one match the session becomes `done` and `matched_activity_id` is set. With several, the
   closest `target_minutes` to the activity duration wins.
4. No match: the activity stays unplanned and is still shown in the calendar.
5. A planned session whose day has passed without a match is shown as missed. The athlete can mark
   it `skipped` explicitly. The coach reads both statuses in the next report.

## Athlete actions

| Action                        | Effect                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Mark a session done, skipped  | updates `status`, with an optional note                                                                                          |
| Move a session to another day | updates `planned_date` within the current plan weeks (warns when it breaks a rule such as consecutive hard days, does not block) |

## UI

- `/plan`: a header card with the latest report's headline, its date and a link to the Coach
  page, then the current and next week as sections (week total, kind chips, sessions as rows with
  mark done, skip and move), then an "Outlook" section with one card per upcoming race. When a
  race or availability change came after the last report, a note says so.
- The dashboard calendar shows planned sessions as outlined chips, completed ones filled (see
  [ux-design.md](ux-design.md)). Only the weeks the coach has written are filled.

## Backend files

| File                                                                                                                                           | Purpose                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `controllers/get-plan.controller.ts`, `update-planned-session.controller.ts`                                                                   | tRPC routes                                    |
| `services/get-plan.service.ts`, `save-report-sessions.service.ts`, `match-activity-to-session.service.ts`, `update-planned-session.service.ts` | business logic                                 |
| `repositories/planned-sessions.repository.ts`                                                                                                  | data access                                    |
| `helpers/compute-taper.helper.ts`, `compute-block-position.helper.ts`                                                                          | pure rules used by the coach context and tests |

## Tests

Unit tests for `compute-taper` (Hyrox versus 10k, B and C races, two close races),
`compute-block-position` (recovery week position from 5 weeks of load), and
`match-activity-to-session` (one match, several candidates, no match, kind mismatch).
