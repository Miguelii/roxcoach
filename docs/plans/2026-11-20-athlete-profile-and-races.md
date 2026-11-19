# Athlete Profile, Availability and Races Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the athlete edit their profile and weekly availability and manage any number of races with goals, all on real data, and show the races on the calendar and the dashboard.

**Architecture:** Two backend modules (`athlete`, `races`) in the established controller, service, repository layering over tables that already exist (`athlete_profiles`, `availability_slots`, `races`). The UI adds Profile and Weekly availability tabs to Settings, a real Races page, and race chips and a "next race" card on the dashboard. The Sunday coach (a later plan) consumes this data.

**Tech Stack:** Next.js 16 (`cacheComponents`), Effect v4, tRPC 11, Supabase (schema `roxcoach`, RLS), zod 4, react-hook-form, Vitest via `vp test`.

**Spec:** `docs/tech-specs/athlete-races.md` (binding), plus `docs/tech-specs/database.md` (the three tables and their checks), `docs/tech-specs/ux-design.md`, `docs/tech-specs/architecture.md`. The specs win over this plan; Task 7 updates the spec text for the decisions below.

This is plan 3 of the series. Later plans: 4 manual logging; 5 coach weekly report, plan and cron.

## Global Constraints

- All code, identifiers, comments and UI copy in English. No em-dashes anywhere. pnpm only. `@/` imports under `src/`, never relative. Types at the top of the file. Component props use a named `type Props`. Class merging uses `cn()`. Semantic color tokens only. shadcn on base-ui. Read `CLAUDE.md` first: it defines the layering, the test rules (every test element has a `data-testid`, locate by test id only, do not mock modules when a fake dependency can be passed in) and the forms pattern.
- Services are `Effect.fn('name')` on Effect v4 (`Effect.catch`, `Effect.tryPromise`, `return yield*`, no try/catch inside `Effect.gen`). Errors are `Data.TaggedError` in `src/_bff/lib/errors.ts` with `cause: unknown` and `error_hash: ErrorCode` (codes in `error-codes.ts`, distinct 8-character lowercase alphanumeric values). Controllers: one file per route exporting exactly one `<NAME>_PROTECTED_CONTROLLER` with an exhaustive `Match.tag` map; never map `UnauthenticatedError` or `GetUserError`.
- Every repository function takes `supabase: SupabaseClient` then `userId: string` and filters or inserts with `user_id` explicitly. Controllers' services create the session-bound client (`createDBServerClient()`) so RLS applies on top. A row id from the client (race id) must always be combined with `user_id` in the query: another user's id must never read, update, complete or delete anything.
- Dates are plain `YYYY-MM-DD` strings. Times are seconds in the database and `h:mm:ss` in the UI (use `parseClock` and `formatClock` from `@/_bff/core/utils/formatters.utils`; do not duplicate formatters). Optional values are `NULL`, never `'N/A'` or `0` placeholders.
- Server Components that read data render inside `Suspense` and call `createCaller()` (they read cookies); pages use `PageProps<'/route'>` and read `searchParams` inside `Suspense`. Never read `process.env` outside `src/env`.
- Hyrox division keys and labels live in `src/_bff/core/constants/hyrox.constants.ts` (Task 1 adds them); timezone options for the UI live in one constants file importable from the client (`src/_bff/core/constants/timezone.constants.ts`); the server accepts any valid IANA timezone.
- Every commit passes the pre-commit hook (`pnpm fmt`, `pnpm check`, `pnpm knip`; knip treats test files as usage and route files as entries). Run `pnpm test` first. End every commit message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Nothing is pushed. If `git status` shows modified files you did not touch, do not commit them: stash only those files around the commit, never drop or pop an existing stash.

## Rulings Taken While Planning (Task 7 edits the spec)

- Availability is saved by upserting the new set (unique `(user_id, weekday, session_kind)`) and then deleting the rows that are not in the new set. The week is never empty at any point, and a failure after the upsert only leaves stale extras that the next save removes. The spec's "in one transaction" is relaxed accordingly (PostgREST has no transactions).
- The profile row is created on first save. Reading a profile that does not exist returns defaults (empty display name, timezone `Europe/Lisbon`, everything else `null`), never an error.
- Races with `race_type = 'other'` have no distance or division requirement.
- "Cancel race" sets `status = 'cancelled'`; "Delete" is a hard delete reserved for races the athlete created by mistake. The Races page offers Cancel and Complete; Delete is offered only for races without a result.
- The calendar shows `upcoming` and `completed` races, not cancelled ones.
- No plan regeneration is triggered by these mutations (the next Sunday report reads them).

## Review Focus

1. Cross-user safety: update, complete and delete of a race id that belongs to another user must change nothing and look like "not found".
2. Validation edge cases: past date on creation, target time zero or absurd, running without distance, Hyrox without division, Hyrox with a distance, resting heart rate not below max, weekly hours out of range, invalid timezone, rest day combined with other slots, duplicate `(weekday, kind)`, a result recorded on a cancelled race.
3. Availability save atomicity: no state where a failed save leaves the athlete with an empty week.
4. Honest states: a user with no profile, no slots and no races sees sensible empty states, not errors; the dashboard and calendar work with no races.
5. Forms: invalid input never reaches the server, server validation errors surface as fixed field-level or toast copy, never raw server text.

---

### Task 1: Athlete profile backend

**Files:**

- Create: `src/_bff/core/constants/timezone.constants.ts`, `src/_bff/modules/athlete/services/get-profile.service.ts`, `update-profile.service.ts`, `src/_bff/modules/athlete/controllers/get-profile.controller.ts`, `update-profile.controller.ts`, `src/_bff/modules/athlete/helpers/profile-validation.helper.ts`
- Modify: `src/_bff/core/constants/hyrox.constants.ts`, `src/_bff/modules/athlete/repositories/athlete-profiles.repository.ts`, `src/_bff/modules/athlete/athlete.router.ts`, `src/_bff/lib/errors.ts`, `src/_bff/lib/error-codes.ts`
- Test: tests beside each new file under `__tests__`

**Interfaces:**

- Consumes: existing `selectTimezone(supabase, userId)` in the repository and `getAthleteTimezone`.
- Produces: `HYROX_DIVISIONS: ReadonlyArray<{ key: HyroxDivision; label: string }>` and `type HyroxDivision` in `hyrox.constants.ts` (`open_men`, `open_women`, `pro_men`, `pro_women`, `doubles_men`, `doubles_women`, `doubles_mixed`; add a comment that the list must be checked against the official HYROX divisions); `TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }>` (about 12 common IANA zones with `Europe/Lisbon` first); `type ProfileDTO = { displayName: string; timezone: string; maxHr: number | null; restingHr: number | null; hyroxDivision: HyroxDivision | null; weeklyHoursCap: number | null; notes: string | null }`; `type ProfileInput = ProfileDTO`; `validateProfile(input: ProfileInput): Result` helper returning the first typed problem (display name 1 to 60 characters after trim; timezone valid IANA (`Intl.DateTimeFormat`); `maxHr` 120 to 230; `restingHr` 30 to 120; `restingHr < maxHr` when both set; `weeklyHoursCap` greater than 0 and at most 40; `notes` at most 1000 characters; `hyroxDivision` in the constants); repository additions `selectProfile(supabase, userId): Effect<ProfileDTO | null, ProfileQueryError>` and `upsertProfile(supabase, userId, input: ProfileInput): Effect<void, ProfileQueryError>` (upsert on `user_id`); services `getProfile(user: User): Effect<ProfileDTO, ...>` (defaults when no row) and `updateProfile(user: User, input: ProfileInput): Effect<ProfileDTO, ProfileValidationError | ProfileQueryError | CreateSbClientError>`; error class `ProfileValidationError` (extra field `field: string`); controllers `GET_PROFILE_PROTECTED_CONTROLLER` (query) and `UPDATE_PROFILE_PROTECTED_CONTROLLER` (mutation, zod input with the same ranges as `validateProfile`, validation errors map to `BAD_REQUEST`, query errors to `INTERNAL_SERVER_ERROR`); `ATHLETE_ROUTER` gains `getProfile` and `updateProfile`. `getAthleteTimezone` keeps working (reads the same row).

- [ ] **Step 1: Write the failing tests.** `validateProfile`: one case per rule at the boundary (119/120, 230/231, 29/30, 120/121, equal resting and max, 0 and 40.5 hours, 1001-character notes, whitespace-only name, `Mars/Phobos`, unknown division) and a valid full input. Repository (fake client): `upsertProfile` sends `user_id` and `onConflict: 'user_id'`, camelCase mapping of `selectProfile`, `null` preserved, both thrown and returned errors map to `ProfileQueryError`. Services: `getProfile` returns the defaults when the row is missing; `updateProfile` rejects an invalid input with `ProfileValidationError` carrying the field and writes nothing, writes then returns the saved DTO otherwise. Controllers: through `appRouter.createCaller` with services faked: invalid input gives `BAD_REQUEST`.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement.** Numeric columns can come back as numbers or numeric strings from PostgREST: parse with zod as in the training repository. Keep exports minimal.
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: athlete profile backend`.

### Task 2: Weekly availability backend

**Files:**

- Create: `src/_bff/modules/athlete/repositories/availability-slots.repository.ts`, `services/get-availability.service.ts`, `save-availability.service.ts`, `controllers/get-availability.controller.ts`, `save-availability.controller.ts`, `src/_bff/modules/athlete/helpers/availability-validation.helper.ts`
- Modify: `src/_bff/modules/athlete/athlete.router.ts`, `src/_bff/lib/errors.ts`, `src/_bff/lib/error-codes.ts`
- Test: tests beside each new file

**Interfaces:**

- Produces: `type AvailabilitySlotDTO = { weekday: number; sessionKind: 'hyrox' | 'run' | 'strength' | 'cross' | 'rest'; isFixed: boolean; maxMinutes: number | null; notes: string | null }`; `validateAvailability(slots: AvailabilitySlotDTO[]): Result` (weekday 1 to 7 integer; no duplicate `(weekday, sessionKind)`; a weekday with a `rest` slot has no other slot; a `rest` slot has `isFixed = false`, `maxMinutes = null`; `maxMinutes` null or 15 to 360; notes at most 200 characters; at most 4 slots per weekday); repository `selectSlots(supabase, userId): Effect<AvailabilitySlotDTO[], AvailabilityQueryError>` ordered by weekday then kind, `upsertSlots(supabase, userId, slots): Effect<void, AvailabilityQueryError>` (`onConflict: 'user_id,weekday,session_kind'`), `deleteSlotsExcept(supabase, userId, keep: Array<{ weekday: number; sessionKind: string }>): Effect<void, AvailabilityQueryError>` (deletes this user's rows whose `(weekday, session_kind)` is not in `keep`; with an empty `keep` it deletes all of the user's slots); services `getAvailability(user)` and `saveAvailability(user, slots): Effect<AvailabilitySlotDTO[], AvailabilityValidationError | AvailabilityQueryError | CreateSbClientError>` (validate, upsert, then delete the rest, returns the saved list); error classes `AvailabilityQueryError`, `AvailabilityValidationError` (field `message`-free: carry only a stable `reason` code string); controllers `GET_AVAILABILITY_PROTECTED_CONTROLLER` (query) and `SAVE_AVAILABILITY_PROTECTED_CONTROLLER` (mutation, input array of at most 28 slots); `ATHLETE_ROUTER` gains `getAvailability` and `saveAvailability`.

- [ ] **Step 1: Write the failing tests.** Validation: each rule above plus an empty list (valid: an athlete with no availability) and a full valid week. Repository: all queries filter by `user_id`; `deleteSlotsExcept` with a non-empty `keep` builds the correct exclusion and never touches another user; thrown and returned errors map. Service ordering test: upsert happens BEFORE delete, and when the upsert fails nothing is deleted (Review Focus 3); a failing delete after a successful upsert surfaces the error and the new slots stay. Controller: oversize array and invalid weekday give `BAD_REQUEST`.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement** per the interfaces.
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: weekly availability backend`.

### Task 3: Races backend

**Files:**

- Create: `src/_bff/modules/races/types/index.ts`, `repositories/races.repository.ts`, `services/list-races.service.ts`, `create-race.service.ts`, `update-race.service.ts`, `complete-race.service.ts`, `delete-race.service.ts`, `list-races-in-range.service.ts`, `helpers/race-validation.helper.ts`, `controllers/list-races.controller.ts`, `create-race.controller.ts`, `update-race.controller.ts`, `complete-race.controller.ts`, `delete-race.controller.ts`, `races.router.ts`
- Modify: `src/_bff/trpc/router.ts` (`races: RACES_ROUTER`), `src/_bff/lib/errors.ts`, `src/_bff/lib/error-codes.ts`
- Test: tests beside each new file

**Interfaces:**

- Produces: `type RaceDTO = { id: string; name: string; raceType: 'hyrox' | 'running' | 'other'; raceDate: string; location: string | null; distanceM: number | null; hyroxDivision: HyroxDivision | null; targetTimeS: number; priority: 'A' | 'B' | 'C'; status: 'upcoming' | 'completed' | 'cancelled'; resultTimeS: number | null; notes: string | null }`; `type RaceInput = Omit<RaceDTO, 'id' | 'status' | 'resultTimeS'>`; `validateRace(input: RaceInput, today: string): Result` (name 1 to 80 trimmed; date strictly after `today` on creation, any valid calendar date on update of a race that is already `completed`; `running` requires `distanceM` between 400 and 200000; `hyrox` requires a division in the constants and `distanceM` null; `other` has neither required; `targetTimeS` integer between 60 and 86400; notes at most 500; location at most 80); repository functions `selectRaces(supabase, userId, filter: { status?: RaceStatus[]; from?: string; to?: string }): Effect<RaceDTO[], RaceQueryError>` ordered by `race_date` then id, `insertRace(supabase, userId, input): Effect<RaceDTO, RaceQueryError>`, `updateRace(supabase, userId, id, input): Effect<RaceDTO | null, RaceQueryError>` (null when no row matched, filtered by `id` AND `user_id`), `setRaceResult(supabase, userId, id, resultTimeS: number): Effect<RaceDTO | null, RaceQueryError>` (sets `result_time_s` and `status = 'completed'`, only when the row exists for this user and is not `cancelled`), `setRaceStatus(supabase, userId, id, status: 'cancelled' | 'upcoming'): Effect<RaceDTO | null, RaceQueryError>`, `deleteRace(supabase, userId, id): Effect<boolean, RaceQueryError>` (true when a row was deleted); services `listRaces(user, filter)`, `createRace(user, input)` (today comes from the athlete timezone through `getAthleteTimezone` and `todayIn`), `updateRace(user, id, input)`, `completeRace(user, id, resultTimeS)` (a cancelled race fails with `RaceStateError`), `cancelRace(user, id)` (a service in `update-race.service.ts` or its own file, your choice), `deleteRace(user, id)` (a race with a result cannot be deleted: `RaceStateError`), and `listRacesInRange(user, from, to): Effect<RaceDTO[], ...>` (non-cancelled, used by the calendar in Task 6); error classes `RaceQueryError`, `RaceValidationError` (stable `field`), `RaceNotFoundError`, `RaceStateError`; controllers (protected) `LIST_RACES`, `CREATE_RACE`, `UPDATE_RACE`, `COMPLETE_RACE`, `CANCEL_RACE`, `DELETE_RACE` with the usual naming; zod inputs mirror the validation ranges and `id: z.uuid()`; mapping: validation to `BAD_REQUEST`, not found to `NOT_FOUND`, state to `CONFLICT`, query to `INTERNAL_SERVER_ERROR`; `RACES_ROUTER = router({ list, create, update, complete, cancel, delete })`.

- [ ] **Step 1: Write the failing tests.** Validation table (every rule at the boundary: date today and tomorrow, 399 and 400 m, 59 and 60 s, 86400 and 86401 s, hyrox with distance, running without distance, `other`). Repository: every query combines `id` with `user_id` where an id is used; `updateRace`, `setRaceResult`, `setRaceStatus` return `null` for an id that matches no row of this user (fake client with two users' rows proves another user's id changes nothing, Review Focus 1); `deleteRace` returns `false` for another user's id; camelCase mapping with `null` preserved; thrown and returned errors map. Services: create rejects a past date using the athlete timezone (a date that is "today" in Lisbon but already tomorrow in UTC), complete on a cancelled race gives `RaceStateError`, delete of a completed race gives `RaceStateError`, not found maps to `RaceNotFoundError`. Controllers: invalid ids and shapes give `BAD_REQUEST`, not found `NOT_FOUND`.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement.** The database checks (`running` needs a distance, `hyrox` needs a division and no distance) are a second line of defense: the service validates first so the user never sees a raw constraint error.
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: races backend`.

### Task 4: Settings tabs, profile form and availability editor

**Files:**

- Create: `src/modules/settings/use-profile-form.ts`, `profile-form.tsx`, `profile-tab.tsx`, `availability-editor-view.tsx`, `availability-tab.tsx`, `use-availability-editor.ts`, `settings-tabs.tsx`
- Modify: `src/modules/settings/settings-view.tsx`, `src/app/(app)/settings/page.tsx` if needed, `docs/tech-specs/ux-design.md`
- Test: tests beside each new file

**Interfaces:**

- Consumes: Task 1 and 2 controllers through `trpcClient.athlete.*`, `HYROX_DIVISIONS`, `TIMEZONE_OPTIONS`, the existing `StravaCard`.
- Produces: `useProfileForm(defaults: ProfileValues)` and `type ProfileValues` (zod schema in the hook file: same ranges as the server; number fields entered as strings and converted; empty string means `null`); `ProfileForm` (presentational: props `{ defaults, onSubmit: (values) => Promise<void> }`, test ids `profile-form`, `profile-name`, `profile-timezone`, `profile-max-hr`, `profile-resting-hr`, `profile-division`, `profile-hours-cap`, `profile-notes`, `profile-submit`, `profile-saved`); `AvailabilityEditorView` (presentational, props `{ slots, onChange, onSave, saving }`, a 7-column week editor with a per-day "Add" menu (open slot or fixed commitment per kind, plus rest day), chips with remove buttons, and the summary line "N sessions per week, up to H h"; test ids `availability-editor`, `availability-day-<weekday>`, `availability-add-<weekday>`, `availability-slot-<weekday>-<kind>`, `availability-remove-<weekday>-<kind>`, `availability-summary`, `availability-save`); `use-availability-editor.ts` holds the pure state transitions (`addSlot`, `removeSlot`, rest-day exclusivity, no duplicates) exported as plain functions and tested directly; `SettingsTabs` with `Profile`, `Weekly availability` and `Strava` tabs (default `Profile`; the Strava tab still receives the validated `strava` search param and defaults to the Strava tab when that param is present); thin wrappers `ProfileTab` and `AvailabilityTab` fetch with `trpcClient.athlete.getProfile` and `getAvailability`, show skeletons and an error state with retry, and save with the mutations (toast on success and failure with fixed copy, then invalidate the query).

- [ ] **Step 1: Write the failing tests.** Hook and schema: invalid inputs produce field messages (empty name, resting not below max, 241 bpm, hours above 40, notes too long), empty optional strings become `null`. `ProfileForm`: renders defaults, invalid submit shows field errors and does not call `onSubmit`, a valid submit calls it with converted values. Availability state functions: add open and fixed slots, adding a second slot of the same kind on the same day is ignored, adding a rest day removes the day's other slots, adding a slot to a rest day replaces the rest, remove, summary line computation (sessions count excludes rest, hours rounded to one decimal). `AvailabilityEditorView`: chips render per day, the summary matches, remove and add call `onChange` with the new list, an empty week shows the empty state. `SettingsTabs`: default tab, tab with the `strava` param, tab switch. Use presentational components with fixture props; the thin wrappers need only a small test with a fake query result passed in if the design allows it (otherwise a documented minimal test, as for the Strava card).
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement** following the form pattern in `CLAUDE.md` and the BrewStock style already used by `login-card.tsx` and the Strava card. The timezone field is a Select of `TIMEZONE_OPTIONS` with the saved value included even when it is not in the list.
- [ ] **Step 4: Verify in the browser** only what needs no sign-in (never read `.env`, never enter credentials); say in the report what could not be verified.
- [ ] **Step 5: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 6: Commit** `feat: settings profile and availability tabs`.

### Task 5: Races page

**Files:**

- Create: `src/modules/races/race-card-view.tsx`, `race-form-dialog.tsx`, `use-race-form.ts`, `complete-race-dialog.tsx`, `races-list.tsx`, `races-view.tsx`, `src/_bff/core/helpers/race-pace.helper.ts`
- Modify: `src/app/(app)/races/page.tsx` (replace `ComingSoon`), `docs/tech-specs/ux-design.md`
- Test: tests beside each new file

**Interfaces:**

- Consumes: Task 3 controllers through `trpcClient.races.*` and `createCaller()`, `RaceDTO`, `parseClock`, `formatClock`, `formatPace`, `todayIn`.
- Produces: `requiredPaceMps(distanceM: number, targetTimeS: number): number` helper (goal speed in m/s, shown through `formatPace`; running races only); `useRaceForm(defaults)` with the schema in the hook (name, type, date, location, distance in km as a string (required for running), division (hyrox), goal time `h:mm:ss` through `parseClock`, priority A/B/C, notes; the date must be after today, `today` passed in); `RaceFormDialog` (create and edit, props `{ mode, defaults, today, defaultDivision, onSubmit }`; the division defaults to the profile division); `CompleteRaceDialog` (result time field, shows the goal and the delta); `RaceCardView` (name, date, location, type, "days to go" (computed from `today`), goal time, priority chip (A: Target race, B: Tune-up, C: Training race), required pace for running races, result and delta for completed ones; actions Edit, Complete, Cancel with a confirmation, Delete only when there is no result; test ids `race-card-<id>`, `race-days-<id>`, `race-goal-<id>`, `race-edit-<id>`, `race-complete-<id>`, `race-cancel-<id>`, `race-delete-<id>`, `race-new`, `races-empty`, `races-history`); `RacesView` (server component inside `Suspense`: lists upcoming races by date, the collapsed history of completed and cancelled ones, an empty state "No races yet. Add one to get a coach plan." with the "New race" button); thin client wrapper does the mutations then `router.refresh()` and a toast with fixed copy.

- [ ] **Step 1: Write the failing tests.** `requiredPaceMps` (10 km in 39:59 is about 4.17 m/s, which formats as 3:59 /km; zero distance guarded). Race form schema: every rule at its boundary and the date after today, running requires distance, hyrox hides distance and requires division, invalid goal time text. `RaceCardView`: days to go for today plus 42, completed state shows the result and the delta text ("1:42 slower than goal" and "faster"), Delete absent when a result exists, Cancel asks for confirmation, a cancelled race is shown in the history only, null location and notes render nothing and no "N/A". `CompleteRaceDialog` field validation. `RacesView`/list: empty state, upcoming sorted by date, history collapsed. Presentational components get fixture props and callbacks (no module mocks).
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement** the page and components; remove any now-dead `ComingSoon` use for this route only.
- [ ] **Step 4: Verify in the browser** only what needs no sign-in; report what could not be verified.
- [ ] **Step 5: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 6: Commit** `feat: races page`.

### Task 6: Races on the calendar and the dashboard

**Files:**

- Create: `src/modules/dashboard/next-race.tsx`
- Modify: `src/_bff/modules/training/types/index.ts` (`CalendarItem` becomes a union), `src/_bff/modules/training/services/get-calendar.service.ts`, `src/modules/calendar/calendar-chip.tsx`, `day-panel.tsx`, `month-view.tsx`, `week-view.tsx`, `item-key.ts`, `week-stats.ts` (activities only: it must ignore race items), `src/modules/dashboard/dashboard-content.tsx`, `docs/tech-specs/ux-design.md`
- Test: updated and new tests under the touched modules

**Interfaces:**

- Consumes: `listRacesInRange` (Task 3) through a `races` service import only (no cross-module repository access).
- Produces: `CalendarItem = { type: 'activity'; date: string; activity: ActivityDTO } | { type: 'race'; date: string; race: RaceSummaryDTO }` with `RaceSummaryDTO = Pick<RaceDTO, 'id' | 'name' | 'raceType' | 'raceDate' | 'targetTimeS' | 'priority' | 'status'>`; `getCalendar` returns activities and non-cancelled races of the range merged and ordered; race chip (amber tone, flag icon, name, priority letter, links to `/races`); the day panel lists races of the day with goal time; the month view totals and the week strip ignore races; `NextRace` server component (inside the dashboard `Suspense`): the next upcoming race (name, date, days to go, goal time, priority) linking to `/races`, hidden when there is none.

- [ ] **Step 1: Write the failing tests.** `getCalendar` merges both sources in order and drops cancelled races; `computeTotals` and `computeLoadRatio` ignore race items; `CalendarChip` renders a race chip with the priority letter and an activity chip as before (discriminated union handled exhaustively); `item-key` returns distinct keys for an activity and a race with the same id string; the day panel shows race goal time; `NextRace` view with fixture props shows days to go and renders nothing for no race.
- [ ] **Step 2: Run** and confirm failure.
- [ ] **Step 3: Implement.** Keep switch statements exhaustive on `item.type` (lint requires `Match` or a switch, not chained ternaries).
- [ ] **Step 4: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 5: Commit** `feat: races on the calendar and dashboard`.

### Task 7: Docs and spec updates

**Files:**

- Modify: `docs/tech-specs/athlete-races.md`, `docs/tech-specs/database.md` (note on availability save), `docs/tech-specs/ux-design.md`, `docs/tech-specs/architecture.md` (athlete and races modules as built), `README.md` (a short "Profile, availability and races" note: what the Sunday coach reads)
- Test: none (docs); a link and claim check by reading the code

- [ ] **Step 1: Update `docs/tech-specs/athlete-races.md`** to the final behavior as built: the validation ranges, the profile defaults, the availability save strategy (upsert then delete, no transaction), the race states (`cancelled`, completion, delete rules), the `other` type, the controller and service file names that exist, the calendar and dashboard integration. Every statement must be checked against the code on disk; remove statements about things not built.
- [ ] **Step 2: Update the other specs and the README** accordingly. No em-dashes.
- [ ] **Step 3: Run** `pnpm test && pnpm check && pnpm knip`.
- [ ] **Step 4: Commit** `docs: athlete profile, availability and races specs`.
