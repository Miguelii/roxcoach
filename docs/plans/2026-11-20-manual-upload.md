# Manual Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The athlete uploads a FIT, TCX or GPX file from a drawer on the dashboard and gets one activity (with laps) in the calendar, with the original file kept in Supabase Storage.

**Architecture:** A route handler `POST /api/activities/upload` checks the session and the access flag, then calls an `upload-activity` service in the `training` module. The service detects the format from the bytes, parses to one normalized `ParsedActivity`, writes the object to a private bucket, then the `activities`, `activity_laps` and `activity_files` rows, with the session-bound client so RLS applies. Parsers are pure helpers (FIT, TCX, GPX), so they are tested with real exported files and no mocks.

**Tech Stack:** Next.js 16 route handler, Effect v4, Supabase Storage, `@garmin/fitsdk` (FIT), `fast-xml-parser` (TCX, GPX), vaul drawer (`src/components/ui/drawer.tsx`), react-hook-form + zod, PGlite for SQL tests, `pnpm test`.

**Spec:** `docs/tech-specs/manual-upload.md` (binding). Also read `docs/tech-specs/database.md`, `docs/tech-specs/manual-logging.md` and `CLAUDE.md`.

## Global Constraints

- All code, identifiers, comments, error tags, enum values and UI copy in English. No em-dashes anywhere (code, comments, copy, docs, commits).
- `pnpm` only. Run tests with `pnpm test` (never vitest directly). Do not start a dev server.
- Imports under `src/` use the `@/` alias, never relative. Types are declared at the top of the file. Components take a named `type Props`. Merge classes with `cn()`, semantic tokens only.
- Every test element carries a `data-testid` and is located by test id only. No module mocks in application tests when a fake can be passed in.
- `_bff` never imports from `src/lib`, `src/modules`, `src/components`, `src/hooks`, `src/app`. Files shared with the frontend live in `src/_bff/core/`.
- Repositories: first params `supabase` then `userId`, every query filters by `user_id`, every insert sets it, check both the `Effect.tryPromise` catch and the returned `error`. Errors are `Data.TaggedError` with `cause: unknown` and `error_hash: ErrorCode`. File content and the original file name never reach logs or error payloads.
- Supabase clients use `db: { schema: 'roxcoach' }`. Access flag is exactly `app_metadata.roxcoach === true`.
- Limits from the spec: max file size 10 MB (10 * 1024 * 1024 bytes), formats `fit`, `tcx`, `gpx`, one file per upload, bucket `activity-files` (private), path `<user_id>/<file_id>.<format>`.
- Update the spec in the same change when behavior or contracts change. Pre-commit runs `pnpm fmt`, `pnpm check`, `pnpm knip` (hook runs `git add -A`).

## Review Focus

Inputs the spec implies but no task would otherwise pin, most likely first. Each is tested in the task named in brackets.

1. Same activity uploaded twice in two formats (FIT then TCX of one workout): the content hash differs, so it must still be rejected as already uploaded by an existing activity with the same `started_at` for that user [Task 5].
2. Two concurrent uploads of the same file: the unique `(user_id, sha256)` violation must surface as the duplicate error, not a 500 [Task 5].
3. A file whose extension lies (a `.gpx` that is FIT bytes, or text renamed `.fit`): format comes from the content; unrecognised content is "unsupported", never a crash [Task 2].
4. An activity with no timestamps or no records (empty track, FIT without a session message): a tagged parse error, nothing stored; a FIT without a session message still works by deriving totals from records [Tasks 2, 3].
5. An activity that crosses midnight or starts near it in the athlete's timezone: `local_date` is the date in the athlete's timezone, not UTC [Task 5].

---

## File Structure

| File                                                                           | Responsibility                                                                               |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `db/migrations/0008_activity_files.sql`                                        | table `activity_files`, bucket `activity-files`, storage policies                            |
| `src/_bff/modules/training/types/index.ts`                                     | add `ActivityFormat`, `ParsedLap`, `ParsedActivity`; `LapRow` numeric fields become nullable |
| `src/_bff/modules/training/helpers/detect-activity-format.helper.ts`           | format from bytes                                                                            |
| `src/_bff/modules/training/helpers/parse-fit.helper.ts`                        | FIT to `ParsedActivity`                                                                      |
| `src/_bff/modules/training/helpers/parse-tcx.helper.ts`, `parse-gpx.helper.ts` | XML formats to `ParsedActivity`                                                              |
| `src/_bff/modules/training/helpers/parse-activity-file.helper.ts`              | dispatch by detected format                                                                  |
| `src/_bff/modules/training/helpers/label-hyrox-laps.helper.ts`                 | station labels by lap order                                                                  |
| `src/_bff/modules/training/repositories/activities.repository.ts`              | add `insertActivity`, `selectIdByStartedAt`, `deleteActivity`                                |
| `src/_bff/modules/training/repositories/activity-files.repository.ts`          | table `activity_files`                                                                       |
| `src/_bff/modules/training/repositories/activity-files-storage.repository.ts`  | bucket upload and remove                                                                     |
| `src/_bff/modules/training/services/upload-activity.service.ts`                | the orchestration                                                                            |
| `src/app/api/activities/upload/route.ts`                                       | multipart entry point                                                                        |
| `src/modules/dashboard/upload-activity-drawer.tsx`, `use-upload-activity.ts`   | UI                                                                                           |

---

### Task 1: Migration, DB tests, dependencies

**Files:**

- Create: `db/migrations/0008_activity_files.sql`
- Modify: `db/tests/schema.test.ts`, `db/tests/rls.test.ts`, `db/tests/tenant-isolation.test.ts`, `db/tests/helpers/fixtures.ts`, `db/README.md`, `docs/tech-specs/database.md`, `src/_bff/lib/error-codes.ts`, `package.json`

**Interfaces:**

- Produces: table `roxcoach.activity_files` with the columns of the spec; bucket id `activity-files`; fixture row builder for `activity_files`.

- [ ] **Step 1: Extend the DB suites first (they fail).** Add `activity_files` to the table lists in `schema.test.ts` and `tenant-isolation.test.ts`, add `'0008_activity_files.sql'` to the recorded-migrations list, add a fixture builder for `activity_files` in `fixtures.ts` (child of the seeded activity), and new tests in `schema.test.ts`: `rejects a duplicate sha256 for one user and accepts it for another`, `rejects a format outside fit, tcx and gpx`, `rejects a status outside parsed and failed`, `rejects a file row that points at another user's activity` (composite foreign key). The tenant-isolation and RLS suites iterate every table, so they cover the new one once the fixture exists.
- [ ] **Step 2: Run `pnpm test`.** Expected: the DB suites FAIL (missing table and migration).
- [ ] **Step 3: Write `0008_activity_files.sql`** in the migration house style (`begin;` first, `insert into roxcoach.schema_migrations` last, `commit;`): the table with the spec columns (`activity_id` nullable, composite foreign key `(activity_id, user_id)` to `activities`, `format` and `status` checks, `unique (user_id, sha256)`, `set_updated_at` trigger, RLS enabled, owner policy per operation using `roxcoach.has_access()` exactly as `0006` does). Insert the bucket into `storage.objects`' parent `storage.buckets` (`public = false`, `file_size_limit = 10485760`, `allowed_mime_types` null since extensions are checked in code). Add storage policies on `storage.objects` for select, insert, delete scoped to `bucket_id = 'activity-files' and (storage.foldername(name))[1] = auth.uid()::text and roxcoach.has_access()`. PGlite has no `storage` schema: wrap the bucket and policy statements so the file still applies in tests (the test helper creates a minimal `storage.buckets` and `storage.objects` stub, see Step 4), and keep them clearly separated at the bottom of the file.
- [ ] **Step 4: Add the `storage` stub to the PGlite helper** (`db/tests/helpers/pglite.ts`): minimal `storage.buckets` and `storage.objects` tables plus `storage.foldername(text) returns text[]`, created before migrations run, with a comment that the real schema is managed by Supabase.
- [ ] **Step 5: Run `pnpm test`.** Expected: PASS. Add one storage-policy test in `rls.test.ts`: `a user cannot insert an object under another user's folder` and `an authenticated user without the access flag cannot insert at all`.
- [ ] **Step 6: Housekeeping.** Delete the unused `TRAINING_ACTIVITY_FIND*`, `TRAINING_ACTIVITY_UPDATE*`, `TRAINING_ACTIVITY_SOFT_DELETE*`, `TRAINING_ACTIVITY_COUNT*` and `TRAINING_ACTIVITY_EXISTING_IDS*` codes from `error-codes.ts` (a leftover of the Strava removal). Keep `TRAINING_ACTIVITY_INSERT*`, which Task 5 uses. Update `db/README.md` (migration list) and `docs/tech-specs/database.md` (table `activity_files`, migration row, bucket). Install dependencies: `pnpm add @garmin/fitsdk fast-xml-parser` (check each package's current version, license and that it imports under Node in a Next.js route; record the versions in the commit message).
- [ ] **Step 7: Run `pnpm test && pnpm check && pnpm knip`.** `knip` will flag the new deps as unused until Task 2: add them in the task that first imports them if the hook fails. Commit `feat: add activity_files table and bucket`.

---

### Task 2: Normalized types, format detection, FIT parser

**Files:**

- Create: `src/_bff/modules/training/helpers/detect-activity-format.helper.ts`, `parse-fit.helper.ts`, `parse-activity-file.helper.ts`
- Modify: `src/_bff/modules/training/types/index.ts`, `src/_bff/lib/errors.ts`, `src/_bff/lib/error-codes.ts`
- Test: `src/_bff/modules/training/helpers/__tests__/detect-activity-format.helper.test.ts`, `parse-fit.helper.test.ts`, fixtures in `src/_bff/modules/training/helpers/__tests__/fixtures/`

**Interfaces:**

- Produces (types, in `types/index.ts`):
    - `ActivityFormat = 'fit' | 'tcx' | 'gpx'`
    - `ParsedLap = { lapIndex: number; name: string | null; startedAt: string; elapsedTimeS: number | null; movingTimeS: number | null; distanceM: number | null; avgHr: number | null; avgSpeedMps: number | null; calories: number | null }`
    - `ParsedActivity = { format: ActivityFormat; startedAt: string; sportType: string | null; category: ActivityCategory; name: string; distanceM: number | null; movingTimeS: number | null; elapsedTimeS: number | null; elevationGainM: number | null; avgHr: number | null; maxHr: number | null; avgSpeedMps: number | null; calories: number | null; noteText: string | null; laps: ParsedLap[] }` (`noteText` is the TCX `Notes`, used for Hyrox hinting). `ActivityCategory` is exported again.
    - `LapRow` numeric fields `distance_m`, `elapsed_time_s`, `moving_time_s` become `number | null` (the table allows it, Zepp laps have no distance).
- Produces (errors): `UnsupportedActivityFileError`, `ActivityFileParseError` (both `ServiceErrorFields`), with codes `TRAINING_FILE_UNSUPPORTED`, `TRAINING_FILE_PARSE`.
- Produces (helpers): `detectActivityFormat(bytes: Uint8Array): ActivityFormat | null`; `parseFit(bytes: Uint8Array): Effect<ParsedActivity, ActivityFileParseError>`; `parseActivityFile(bytes: Uint8Array): Effect<ParsedActivity, UnsupportedActivityFileError | ActivityFileParseError>`, which Task 3 extends with TCX and GPX.

- [ ] **Step 1: Add the fixtures.** Copy the two real exports into `fixtures/` as `zepp-hyrox-test.fit` and `zepp-hyrox-test.tcx` (from `~/Downloads/Zepp20261120120819.*`; they hold only heart rate and timestamps). Add small synthetic fixtures built in the test with an inline builder where a real file does not exist: a truncated FIT (first 40 bytes of the real one), plain text renamed to `.fit`, and an empty array.
- [ ] **Step 2: Write the failing tests.** `detect-activity-format`: real FIT gives `'fit'`, real TCX gives `'tcx'`, a minimal `<gpx ...>` gives `'gpx'`, text gives `null`, an empty array gives `null`, a FIT whose bytes are labelled in a variable named like a gpx file still gives `'fit'`. `parse-fit` on the real file asserts the facts verified in the spec: `startedAt` `2026-11-20T12:08:19.000Z` (the session start), 3 laps, `elapsedTimeS` 133 for the activity, `avgHr` 98, `maxHr` 104, `calories` 7, `distanceM` null, `sportType` set, `category` `other`, laps have `lapIndex` 0 to 2 and no station. Failure cases: truncated file returns `ActivityFileParseError`; a FIT with no session message but records returns totals derived from the records; a FIT with neither records nor session returns the parse error.
- [ ] **Step 3: Run the tests.** Expected: FAIL (modules missing).
- [ ] **Step 4: Implement** the types, errors (add codes in the `// Training` group), `detectActivityFormat` (FIT: ASCII `.FIT` at bytes 8 to 11; XML: decode the first 512 bytes as text, root element `TrainingCenterDatabase` gives `tcx`, `gpx` gives `gpx`, tolerant of a BOM and leading whitespace) and `parseFit` with `@garmin/fitsdk` (a `Decoder` reads messages; map session, lap and record messages; convert FIT timestamps to ISO; map `sport` to `category` through a small pure `categoryFromSport(sport: string | null): ActivityCategory`: running to `run`, training and strength to `strength`, cross training to `cross`, everything else `other`). The SDK throws, so wrap the call in `Effect.try` and map every failure to `ActivityFileParseError` without the raw message.
- [ ] **Step 5: Run `pnpm test`.** Expected: PASS. Commit `feat: parse FIT activity files`.

---

### Task 3: TCX and GPX parsers

**Files:**

- Create: `src/_bff/modules/training/helpers/parse-tcx.helper.ts`, `parse-gpx.helper.ts`
- Modify: `parse-activity-file.helper.ts` (dispatch)
- Test: `__tests__/parse-tcx.helper.test.ts`, `parse-gpx.helper.test.ts`, `parse-activity-file.helper.test.ts`

**Interfaces:**

- Consumes: `ParsedActivity`, `ParsedLap`, `ActivityFileParseError`, `categoryFromSport` (Task 2).
- Produces: `parseTcx(bytes: Uint8Array): Effect<ParsedActivity, ActivityFileParseError>` and `parseGpx(bytes: Uint8Array): Effect<ParsedActivity, ActivityFileParseError>`.

- [ ] **Step 1: Write the failing tests.** `parse-tcx` on the real file: `startedAt` `2026-11-20T12:08:19.000Z`, one lap, `elapsedTimeS` 133, `avgHr` 98, `maxHr` 104, `calories` 7, `distanceM` null, `noteText` `'Corrida HYROX'`, `sportType` `'Other'`, name falls back to the note. Synthetic TCX strings built in the test: several laps with distance and `Sport="Running"` give `category` `run` and summed totals; a TCX with no `Lap` gives the parse error. `parse-gpx`: a GPX with 3 points carrying `time`, `ele` and a Garmin `hr` extension gives derived distance (haversine), elapsed time, elevation gain (sum of positive deltas) and average heart rate; a GPX without heart rate gives `avgHr` null; a GPX with no timestamped point gives the parse error; `laps` is `[]`. `parse-activity-file`: dispatches by content, `null` format gives `UnsupportedActivityFileError`.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement both parsers** with `fast-xml-parser` configured to keep arrays for `Lap`, `Trackpoint`, `trkpt` and to ignore namespaces prefixes. Set an entity-expansion limit or disable entity processing (XML bombs: a file is untrusted input). Share the XML parser construction in one small internal function in `parse-tcx.helper.ts`, imported by the GPX one only if that avoids duplication.
- [ ] **Step 4: Run `pnpm test`.** Expected: PASS. Commit `feat: parse TCX and GPX activity files`.

---

### Task 4: Hyrox lap labelling

**Files:**

- Create: `src/_bff/modules/training/helpers/label-hyrox-laps.helper.ts`
- Modify: `src/_bff/core/constants/hyrox.constants.ts` (export `HYROX_STATION_ORDER`)
- Test: `__tests__/label-hyrox-laps.helper.test.ts`

**Interfaces:**

- Consumes: `ParsedLap` (Task 2), `HyroxStation`, `HYROX_STATION_ORDER`.
- Produces: `labelHyroxLaps(laps: ParsedLap[]): Array<HyroxStation | null> | null`: returns one entry per lap (even positions are runs and get `null`, odd positions get `HYROX_STATION_ORDER[(index - 1) / 2]`) only when `laps.length === 16`; otherwise `null`.

- [ ] **Step 1: Write the failing tests.** 16 laps give 8 `null` runs and the 8 stations in order starting with `ski_erg`; 15 and 17 laps give `null`; 0 laps give `null`; the Zepp sample (3 laps) gives `null`. The rule is a heuristic from the lap order, documented in the test names.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** the pure function. **Step 4: Run `pnpm test`, expect PASS.** Commit `feat: label hyrox laps by order`.

---

### Task 5: Repositories and upload service

**Files:**

- Modify: `src/_bff/modules/training/repositories/activities.repository.ts`, `src/_bff/lib/errors.ts`, `src/_bff/lib/error-codes.ts`, `src/_bff/modules/training/types/index.ts`
- Create: `activity-files.repository.ts`, `activity-files-storage.repository.ts`, `services/upload-activity.service.ts`
- Test: `repositories/__tests__/activity-files.repository.test.ts`, `activities-write.repository.test.ts`, `services/__tests__/upload-activity.service.test.ts`

**Interfaces:**

- Consumes: `parseActivityFile` (Tasks 2, 3), `labelHyroxLaps` (Task 4), `replaceLaps` and `LapRow`, `getAthleteTimezone`, `todayIn`-style date helpers (add `localDateIn(isoInstant: string, timezone: string): string` to `src/_bff/core/utils/date.utils.ts`, tested there).
- Produces:
    - Errors: `DuplicateActivityFileError`, `ActivityFileTooLargeError`, `ActivityFileStorageError` with codes (`TRAINING_FILE_DUPLICATE`, `TRAINING_FILE_TOO_LARGE`, `TRAINING_FILE_STORAGE_PUT`, `_PUT_ERR`, `_REMOVE`, `_REMOVE_ERR`, `TRAINING_ACTIVITY_START_LOOKUP`, `_ERR`, `TRAINING_ACTIVITY_DELETE`, `_ERR`, `TRAINING_FILE_ROW_INSERT`, `_ERR`).
    - `insertActivity(supabase, userId, row: NewActivityRow): Effect<string, ActivityWriteError>` (returns id; `source` is `'manual'`), `selectIdByStartedAt(supabase, userId, startedAt: string): Effect<string | null, ActivityQueryError>`, `deleteActivity(supabase, userId, id: string): Effect<void, ActivityWriteError>`.
    - `insertActivityFile(supabase, userId, row: NewActivityFileRow): Effect<void, ActivityWriteError | DuplicateActivityFileError>` (maps the unique violation `23505` to the duplicate error).
    - `putActivityFile(supabase, path: string, bytes: Uint8Array, contentType: string): Effect<void, ActivityFileStorageError>` and `removeActivityFile(supabase, path: string): Effect<void, ActivityFileStorageError>`.
    - `uploadActivity(user: User, input: { bytes: Uint8Array; originalName: string; isHyrox: boolean }): Effect<{ activityId: string }, ...>`.

- [ ] **Step 1: Write the failing repository tests** with the existing `makeFakeDb`: user filter on every query, `user_id` set on every insert, thrown and returned errors both tagged, unique violation becomes `DuplicateActivityFileError`. Storage repository tests pass a fake storage client object (`{ from: () => ({ upload, remove }) }`) and check the path and `upsert: false`.
- [ ] **Step 2: Write the failing service tests** (fake supabase, fake storage, fake timezone passed in through an injectable dependency object, never a module mock): success writes object, activity, laps (labelled when `isHyrox` and 16 laps), then the file row, and returns the activity id; file over 10 MB gives `ActivityFileTooLargeError` before any parsing; the same bytes twice gives the duplicate error and no second object; a second upload of another format with the same `startedAt` gives the duplicate error (Review Focus 1); a unique violation on the file insert gives the duplicate error (Review Focus 2) and the object and activity are rolled back; parse failure stores nothing; a database failure after the upload removes the object and deletes the activity; a start at `2026-11-20T23:30:00Z` for timezone `Europe/Lisbon` in winter keeps `localDate` `2026-11-20`, and for `Asia/Tokyo` is `2026-11-21` (Review Focus 5).
- [ ] **Step 3: Run `pnpm test`.** Expected: FAIL.
- [ ] **Step 4: Implement** repositories (storage repository is the only place that touches `supabase.storage`; path is `<userId>/<fileId>.<format>` with `fileId` from `crypto.randomUUID()` and never contains the original name) and the service: size check, parse, sha256 with `crypto.subtle.digest`, duplicate checks (hash, then `startedAt`), timezone lookup, `localDate`, upload object, insert activity, replace laps, insert file row; any failure after the object is written runs the compensation (remove object, delete activity) with `Effect.onError`-style cleanup that never masks the original error. The service takes the session-bound client; no service-role client.
- [ ] **Step 4b: Run `pnpm test`.** Expected: PASS. Commit `feat: upload activity service`.

---

### Task 6: Route handler

**Files:**

- Create: `src/app/api/activities/upload/route.ts`
- Test: `src/app/api/activities/upload/__tests__/route.test.ts`

**Interfaces:**

- Consumes: `uploadActivity` (Task 5), `getSession`, `hasRoxcoachAccess`, `runEffect`-style error mapping.
- Produces: `POST` returning `200 { activityId: string }`, or `{ error: string }` with: 401 no session, 403 no access flag, 413 too large, 415 unsupported, 422 parse error, 409 duplicate, 500 anything else. Messages are the fixed English strings of the spec ("This file is not a valid FIT, TCX or GPX file", "This file was already uploaded", "The file is larger than 10 MB", and a generic one for 500).

- [ ] **Step 1: Write the failing tests.** The route exports a factory `createUploadHandler(deps)` (session lookup and `uploadActivity` injected) and the `POST` export wires the real ones, so tests pass fakes. Cases: no user gives 401 and calls nothing; user without the flag gives 403; no `file` field gives 422; each mapped error gives its status and message; body larger than 10 MB (check `content-length` first, then the file size) gives 413 without reading the stream; success returns the id. The error body never contains the file name or content.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** The `isHyrox` field is a form field `hyrox` equal to `'true'`. **Step 4: Run `pnpm test`, expect PASS.** Commit `feat: activity upload route`.

---

### Task 7: Upload drawer and dashboard button

**Files:**

- Create: `src/modules/dashboard/upload-activity-drawer.tsx`, `src/modules/dashboard/use-upload-activity.ts`
- Modify: `src/modules/dashboard/dashboard-content.tsx` (button row above the week strip)
- Test: `src/modules/dashboard/__tests__/upload-activity-drawer.test.tsx`, `use-upload-activity.test.ts`

**Interfaces:**

- Consumes: `POST /api/activities/upload` (Task 6), `useRouter().refresh()`, `sonner` `toast`.
- Produces: `UploadActivityDrawer()` (trigger button with `data-testid="upload-activity-button"`), `useUploadActivity(options: { upload?: (form: FormData) => Promise<Response> })` returning form state, `submit`, `status: 'idle' | 'uploading' | 'error' | 'success'`, `errorMessage: string | null`. `FormValues` and the zod schema live in the hook file: file required, extension in `fit`, `tcx`, `gpx`, size at most 10 MB, `hyrox` boolean.

- [ ] **Step 1: Write the failing tests** (jsdom, test ids only): the trigger opens the drawer; `upload-format-banner` shows the exact banner copy of the spec; the submit button is disabled until a valid file is chosen; a `.txt` file shows an immediate message and stays disabled; a file over 10 MB shows an immediate message; a `.gpx` file hides the Hyrox checkbox (`upload-hyrox-checkbox`); a `.tcx` whose `Notes` contains "HYROX" turns the checkbox on (read the first 4 KB of the file as text in the hook, an exported pure `detectHyroxHint(text: string): boolean` tested directly); uploading disables the button and keeps the drawer open; an error response shows its `error` text and keeps the file selected; success closes the drawer, calls `toast` and `router.refresh`. The fake `upload` is passed through the hook option, not module-mocked.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** with the project form pattern (shadcn `Form`, `FormField`, `FormControl`, `FormMessage`, `zodResolver`), the existing `drawer.tsx`, semantic tokens only; mount the drawer in `DashboardContent` in a right-aligned row above the week strip (it is already inside a Suspense boundary).
- [ ] **Step 4: Run `pnpm test`, expect PASS.** Commit `feat: upload activity drawer`.

---

### Task 8: Docs sync and final checks

**Files:**

- Modify: `docs/tech-specs/architecture.md` (non-tRPC table gets `src/app/api/activities/upload/route.ts`), `docs/tech-specs/manual-upload.md` (cross-format duplicate rule, size check order, final component names), `docs/tech-specs/ux-design.md` (dashboard upload button), `README.md` (Supabase bucket setup note: the migration creates the bucket, confirm it in the dashboard)

- [ ] **Step 1: Update the docs** to match what was built, including the Review Focus 1 rule (same `started_at` is a duplicate across formats).
- [ ] **Step 2: Run `pnpm fmt && pnpm check && pnpm knip && pnpm test`.** Expected: all pass.
- [ ] **Step 3: Human checklist** (not automated, listed in the final message): apply `0008` in the Supabase SQL editor, confirm the `activity-files` bucket exists and is private, upload the Zepp FIT and TCX from the dashboard, confirm the calendar and activity detail show them, upload the same file again and confirm "already uploaded", confirm the object is under `<user_id>/`.
- [ ] **Step 4: Commit** `docs: sync specs with manual upload`.
