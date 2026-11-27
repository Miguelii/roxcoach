# Athlete and races

Two small modules (`athlete`, `races`) that capture the athlete's starting point and the races
that the coach works from. The coach chat (see [coach-chat.md](coach-chat.md)) reads
these inputs through the services of each module: `getProfile`, `getAvailability` and `listRaces`.

## Athlete profile

Edited in Settings (Profile tab). One row in `athlete_profiles` (see [database.md](database.md)).
Validation lives in `helpers/profile-validation.helper.ts`; the numeric limits are in
`PROFILE_LIMITS` (`src/_bff/core/constants/athlete.constants.ts`), shared by the helper, the
controller input and the form.

| Field              | Required | Rules                                                      |
| ------------------ | -------- | ---------------------------------------------------------- |
| Display name       | yes      | trimmed, 1 to 60 characters                                |
| Timezone           | yes      | a valid IANA zone, default `Europe/Lisbon`                 |
| Max heart rate     | no       | integer 120 to 230                                         |
| Resting heart rate | no       | integer 30 to 120, must be below max heart rate when set   |
| Hyrox division     | no       | a key from `HYROX_DIVISIONS`, default for new Hyrox races  |
| Weekly hours cap   | no       | above 0 and at most 40                                     |
| Notes              | no       | at most 1000 characters, an empty string is stored as NULL |

What reads it today: the timezone drives `todayIn(timezone)` (the dashboard, the races page, the
calendar and race date validation) through `athlete.getTimezone`, and the division is the default
of the race form. The heart rates also feed the dashboard heart rate zones (`max_hr` and `resting_hr`, both
required, see [dashboard-progress.md](dashboard-progress.md)); the weekly cap and the notes are
stored for the coach chat. The profile also carries `dashboardMode` (`run` or `strength`, default
`run`), saved on its own by `athlete.setDashboardMode`; `updateProfile` never writes it.

The Profile tab also shows the sign-in email as a read-only field (hidden when the account has
none). It is not a profile field: `athlete.getProfile` returns `ProfileViewDTO` (the profile plus
`email`, read from the auth user by `getProfileView`), the form does not hold it and `updateProfile`
never receives it. `ProfileDTO`, which the coach context reads, has no email.

Defaults: without a saved row, `getProfile` returns an empty display name, `Europe/Lisbon`, nulls
and mode `run` (a missing row is not an error, but `setDashboardMode` needs the row to exist). `updateProfile` validates first, writes nothing on invalid
input and upserts the row for the signed-in user.

## Weekly availability

The athlete describes a typical week in Settings (Weekly availability tab). Stored as
`availability_slots`. Validation lives in `helpers/availability-validation.helper.ts`.

For each weekday (ISO, 1 = Monday to 7 = Sunday) the athlete can add slots:

| Field        | Meaning                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Session kind | `hyrox`, `run`, `strength`, `cross` or `rest`                                                                        |
| Fixed        | on: a commitment that already exists (for example a Hyrox class every Tuesday). Off: an open slot the coach may fill |
| Max minutes  | integer 15 to 360, or null                                                                                           |
| Notes        | at most 200 characters, or null. Accepted by the API; the editor does not expose it yet                              |

Rules (all validated server-side, the first problem is returned as a reason code):

- The same `(weekday, session_kind)` pair cannot appear twice.
- A weekday has at most 4 slots.
- The editor does not set a minutes limit yet: new slots are saved with `max_minutes` null (the API
  accepts 15 to 360). The weekly summary adds up only slots that have a value.
- A `rest` slot cannot be fixed and has no max minutes, and a weekday with a `rest` slot cannot
  have other slots.
- Fixed slots are meant to be planned as-is, with the coach adapting the load around them. Open
  slots are where the coach places the sessions it chooses.

Save strategy: `saveAvailability` validates, upserts the new set (conflict target
`user_id,weekday,session_kind`) and only then deletes the rows outside it. There is no
transaction. The week is therefore never empty midway: a failed upsert deletes nothing, and a
failed delete leaves the new slots saved plus stale extra slots until the next save. Two
concurrent saves by the same user can race the delete step. The delete removes only the signed-in
user's rows (PostgREST has no tuple `NOT IN`, so the user's pairs are read and the stale ones are
removed with one delete per weekday). Saving an empty week deletes every slot.

Changing availability does not regenerate anything: the coach chat reads the saved week when asked.

UX: a 7-column week editor with the slots as chips per day, an "Add" menu per day and a summary
line ("N sessions per week, up to H h"). See [ux-design.md](ux-design.md).

## Weekly goals

One optional row per athlete in `weekly_goals` (see [database.md](database.md) and the design in
[2026-11-27-weekly-goals-design.md](2026-11-27-weekly-goals-design.md)). The type `WeeklyGoals`,
`DEFAULT_WEEKLY_GOALS`, `DEFAULT_RUN_TYPE_RULES` and `WEEKLY_GOAL_LIMITS` live in
`src/_bff/core/constants/weekly-goals.constants.ts` so the client can use them.

| Field                         | Rules                                         |
| ----------------------------- | --------------------------------------------- |
| `weeklyRunDistanceM`          | optional, meters, 1000 to 500000              |
| `longRunsPerWeek`             | optional, 1 to 7                              |
| `fastRunsPerWeek`             | optional, 1 to 7                              |
| `strengthSessionsPerWeek`     | optional, 1 to 14                             |
| `runTypeRules.shortRunMaxM`   | default 3000, above 0 and below `longRunMinM` |
| `runTypeRules.longRunMinM`    | default 6000, at most 100000                  |
| `runTypeRules.fastPaceSPerKm` | default 300 (5:00/km), 120 to 600             |

Read through `athlete.getWeeklyGoals` (`getWeeklyGoals`, or `getWeeklyGoalsWithClient` for callers
that already hold a client). An athlete without a row gets `DEFAULT_WEEKLY_GOALS` and no error.
Failures (`CreateSbClientError`, `WeeklyGoalsQueryError`) map to `INTERNAL_SERVER_ERROR`.

The rules classify a run with `classifyRun` (`src/_bff/modules/training/helpers/classify-run.helper.ts`,
twin of the SQL `roxcoach.classify_run_default`): no type below `shortRunMaxM` or without a
positive distance and time (moving time, else elapsed time); `long` above `longRunMinM`; otherwise
`fast` when the pace is under `fastPaceSPerKm`, else `long`.

## Races

The athlete can add any number of races. Each has its own goal. Validation lives in
`helpers/race-validation.helper.ts`; the controller input schema is `race-input.schema.ts` (same
ranges).

| Field       | Rules                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| Name        | required, trimmed, 1 to 80 characters, for example `Hyrox Lisbon` or `S. Silvestre Guimaraes 10k`         |
| Type        | `hyrox`, `running` or `other`                                                                             |
| Date        | a real calendar date. Must be after the athlete's today, see the date rules below                         |
| Location    | optional, at most 80 characters, blank is stored as NULL                                                  |
| Distance    | required for `running` (integer meters, 400 to 200000), rejected for `hyrox`                              |
| Division    | required for `hyrox` (a valid key). Rejected for `running` and `other`: non-hyrox races carry no division |
| Target time | required integer seconds, 60 to 86400, entered as `h:mm:ss`. Examples: Hyrox `1:10:00`, 10k `0:39:59`     |
| Priority    | `A`, `B` or `C`, default `A`                                                                              |
| Status      | `upcoming`, `completed`, `cancelled`. A new race is `upcoming`                                            |
| Result time | set when completing a race, integer seconds 1 to 86400                                                    |
| Notes       | optional, at most 500 characters, blank is stored as NULL                                                 |

Goal examples that must be expressible: "Hyrox in 1h10" (target `1:10:00`) and "S. Silvestre 10k
sub 40 min" (target `0:39:59`). The app always shows the stored time, never rewrites it as "sub".

Priority meaning (the coach reads it from the race goals, see [coach-chat.md](coach-chat.md)):

| Priority | Treated as                                                 |
| -------- | ---------------------------------------------------------- |
| `A`      | The target of a full training block: peak and taper        |
| `B`      | A tune-up inside a block: short taper, still a real effort |
| `C`      | A training session: no taper, run as part of the load      |

Date rules ("today" is the athlete's local date from the profile timezone, never UTC):

- Creating a race requires a date strictly after today.
- Editing an upcoming race requires a future date unless the date is unchanged, so an upcoming
  race whose date has passed can still be edited if the date is kept.
- Editing a completed race may keep a past date.

State rules (enforced in the services, answered with a state error):

- Complete: records `result_time_s` and sets the status to `completed`. A cancelled race cannot
  be completed.
- Cancel: the row stays with status `cancelled`. A completed race cannot be cancelled.
- Restore: a `cancelled` race goes back to `upcoming` while its date has not passed (today counts,
  in the athlete's timezone). Any other status, or a past date, is a state error (`CONFLICT`).
- Delete: a hard delete, only for a race without a result (status not `completed` and no
  `result_time_s`). Cancel it instead to keep it as history. Deleting a race detaches planned
  sessions that point at it (`race_id` set null) instead of deleting the sessions.
- A race that is not found, or belongs to another user, is a not-found error (every query also
  filters by `user_id`).

Behaviour in the UI:

- The Races page lists upcoming races sorted by date with days remaining, then a collapsed
  history of completed and cancelled ones.
- The card is a double-bezel surface (outer shell, inner core) toned by state: amber for a target
  race, blue for a tune-up, slate for a training race or a cancelled one, green once completed. It
  shows the priority pill with a flag, the name as a display heading, the date and location with
  icons, the days to go in a tinted panel, then a data grid (race type, goal, required pace or
  result; the required pace of an upcoming race is the goal time over the distance for a running
  race and, for a Hyrox, the run pace from the Hyrox pace table for that goal, as `racePaceSPerKm`
  does for the readiness card), a goal-versus-result chip and the notes. Actions carry icons and are 44 px tall on a
  phone.
- The card offers Edit for upcoming races, and Complete only for upcoming races dated today or
  earlier (the server is permissive and accepts a result for a future-dated race; the UI hides it). New and Edit open a drawer (right side
  on desktop, bottom sheet on mobile) with the shared form layout: a bold title and close control,
  scrollable fields, then Cancel and submit actions in the footer. Footer actions stack at full
  width on mobile and sit side by side at equal widths on desktop. Dropdown and date controls remain
  interactive inside the modal drawer. Complete opens a result dialog;
  Cancel and Delete (Delete only without a result) open contextual confirmation dialogs. A cancelled race in the history whose date is today or later shows Restore, which acts at once, with no dialog. Delete
  explains that it is irreversible and that linked planned sessions remain without the race
  association (copy kept from the dialog; planned sessions no longer exist). A card's actions are disabled while its mutation runs.
- Completing a race shows goal versus result.
- The race list, timezone and profile division are loaded through tRPC client queries with a
  30-second stale time. Cached data stays visible during background refetches and route navigation.
- After any mutation, invalidate the tRPC races list and calendar feed queries so both update
  without refreshing the page.

Integration:

- Calendar: `training.getCalendar` merges activities with races from `listRacesInRange` (upcoming
  and completed, never cancelled) into a `CalendarItem` union. Races are shown as chips, and are
  ignored by the week totals and the week strip.
- Upcoming and completed races are listed on `/races`; the dashboard is reserved for training
  progress.

## Backend

Module `athlete` (`athlete.router.ts` is the namespace `athlete`):

| File                                                                              | Purpose                                                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `controllers/get-profile.controller.ts`                                           | protected query                                                                                   |
| `controllers/get-timezone.controller.ts`                                          | protected query, the timezone string (default Europe/Lisbon); the dashboard derives today from it |
| `controllers/update-profile.controller.ts`                                        | protected mutation                                                                                |
| `controllers/get-availability.controller.ts`                                      | protected query                                                                                   |
| `controllers/save-availability.controller.ts`                                     | protected mutation, upsert then delete (no transaction)                                           |
| `controllers/delete-account.controller.ts`                                        | protected mutation without input: deletes the signed-in user's data (see Delete profile)          |
| `services/delete-account.service.ts`, `repositories/account-data.repository.ts`   | storage files, then the auth user (cascade), then local sign-out (service-role client)            |
| `services/get-profile`, `update-profile`, `get-availability`, `save-availability` | business logic and validation, run as the signed-in user                                          |
| `services/get-athlete-timezone.service.ts`                                        | the timezone, used by the controller and by the races services                                    |
| `helpers/profile-validation.helper.ts`, `availability-validation.helper.ts`       | pure validation                                                                                   |
| `repositories/athlete-profiles.repository.ts`, `availability-slots.repository.ts` | data access                                                                                       |
| `controllers/get-weekly-goals.controller.ts`                                      | protected query `athlete.getWeeklyGoals`                                                          |
| `services/get-weekly-goals.service.ts`, `repositories/weekly-goals.repository.ts` | goals read (defaults without a row) and upsert on `user_id`                                       |

Module `races` (`races.router.ts` is the namespace `races`: `list`, `create`, `update`,
`complete`, `cancel`, `restore`, `delete`):

| File                                                                                                     | Purpose                                                                            |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `controllers/list-races.controller.ts`                                                                   | protected query, optional filter by status                                         |
| `controllers/create-race.controller.ts`, `update-race.controller.ts`                                     | protected mutations, input from `race-input.schema.ts`                             |
| `controllers/complete-race.controller.ts`, `cancel-race.controller.ts`, `restore-race.controller.ts`     | protected mutations, the result time, the cancellation and its undo                |
| `controllers/delete-race.controller.ts`                                                                  | protected mutation                                                                 |
| `services/list-races.service.ts`                                                                         | filter by status and dates; also the read entry point for other modules            |
| `services/list-races-in-range.service.ts`                                                                | upcoming and completed races between two dates, used by the training calendar feed |
| `services/create-race`, `update-race` (also `cancelRace`, `restoreRace`), `complete-race`, `delete-race` | business rules above                                                               |
| `services/races-client.service.ts`                                                                       | creates the session-bound Supabase client                                          |
| `helpers/race-validation.helper.ts`                                                                      | pure validation                                                                    |
| `repositories/races.repository.ts`                                                                       | data access, trims text and stores blank location and notes as NULL                |

The mutations do not call the coach.

## Delete profile

`athlete.deleteAccount` (protected, no input: it always acts on `ctx.user`, never on an id sent by
the client) deletes the user's account and everything Roxcoach stores for it.

1. The original activity files in the private `activity-files` bucket (folder `<userId>/`) are
   listed and removed through the Storage API, page by page. Storage objects are not removed by a
   database cascade, and deleting them from SQL would leave the files behind. A failure here stops
   everything, so nothing is lost and the user can retry.
2. The auth user is deleted with `supabase.auth.admin.deleteUser` (service-role client). Every
   Roxcoach table references `auth.users (id)` with `on delete cascade`, so all the user's rows go
   with it: activities (laps, station results, strength sets and file rows), races, weekly
   availability, coach conversations and messages, the Lyfta connection (the encrypted API key goes
   with it), the coach usage counter and the profile. There is no delete function to maintain: a
   table added later is covered by its own foreign key, and `db/tests/schema.test.ts` ("deleting a
   user") fails if one does not cascade.
3. A local sign-out clears the cookie session (best effort, logged on failure), and the client goes
   to `/login`.

- The account is removed from Supabase Auth completely. The project is shared with another app, so
  this also removes that account from the other app; this was a conscious choice. To use Roxcoach
  again the person signs up again on `/signup` with the access code.
- Nothing else is stored elsewhere: the coach keeps no data outside these tables, and Lyfta data is
  only what was imported into them.
