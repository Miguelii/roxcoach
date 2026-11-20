# Manual upload

The athlete adds an activity by uploading the file exported from Strava (or any device). This
replaces the removed Strava sync. Status: implemented (migration `0008`, route, service, parsers, calendar drawer).

## Goal and scope

- An "Upload activity" button on Dashboard and Calendar opens an upload drawer. One file per
  upload: `.fit`, `.tcx` or `.gpx`.
- The server validates and parses the file, creates one `activities` row (plus `activity_laps`
  when the file has laps), and stores the original file.
- Out of scope for v1: bulk upload, `.fit.gz` or `.zip` archives, editing the parsed
  numbers, showing a map, storing every track point in the database.

## Formats

The athlete has two sources: Zepp (Amazfit Bip 6), which exports FIT and TCX, and Strava, which
exports the original (FIT when the activity came from a file) and GPX.

| Aspect     | FIT                                                          | TCX                                              | GPX                                            |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------- |
| Format     | binary, written by the device                                | XML                                              | XML                                            |
| Laps       | yes, with per-lap totals                                     | yes, with per-lap totals                         | no (at most track segments)                    |
| Summary    | session message: sport, distance, time, calories, heart rate | per lap: time, distance, calories, heart rate    | none, everything is derived from track points  |
| Heart rate | yes, per second                                              | yes, per point                                   | only through a vendor extension, often present |
| Sport type | `sport` and `sub_sport`                                      | `Sport` attribute (`Running`, `Biking`, `Other`) | free text `type`, not always present           |

Decision: **support all three, one parser interface** (`parseActivityFile`). Each parser returns the same normalized
result, so the rest of the pipeline is format-agnostic. FIT is preferred when both exist (most
complete), TCX is close behind and shares the XML parser with GPX, and GPX is the fallback when
the source offers nothing else. Build order: FIT end to end first, then TCX, then GPX.

## Storage

Decision: **Supabase Storage for the original file, the database for everything queryable.**

| Data                              | Where                                       |
| --------------------------------- | ------------------------------------------- |
| Original file (bytes)             | Storage, private bucket `activity-files`    |
| File metadata, hash, parse status | table `activity_files`                      |
| Summary and laps                  | `activities` and `activity_laps` (existing) |
| Track points (per second records) | not stored in v1                            |

Why not the database for the bytes: files are up to a few MB each, are never queried, and would
bloat backups and the shared project. Why keep the original at all: a parser fix or a new field
can be applied again by reprocessing, without asking the athlete to upload again.

Track points are not stored: nothing in v1 reads them (no map, no charts). If a later feature
needs them, they are re-parsed from the stored file.

### Table `activity_files` (migration `0008`)

Standard rules apply: `user_id` default `auth.uid()` with cascade, RLS with the owner policy, grants
as in `0001`.

| Column          | Type      | Notes                                                                                                 |
| --------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `id`            | uuid      | primary key                                                                                           |
| `activity_id`   | uuid null | composite foreign key `(activity_id, user_id)` to `activities`, null while parsing or after a failure |
| `format`        | text      | check in `fit`, `tcx`, `gpx`                                                                          |
| `storage_path`  | text      | `<user_id>/<file_id>.<format>`                                                                        |
| `sha256`        | text      | unique per user, blocks the same file twice                                                           |
| `size_bytes`    | integer   |                                                                                                       |
| `original_name` | text      | display only, never used in a path                                                                    |
| `status`        | text      | `parsed`, `failed`                                                                                    |
| `error_code`    | text null | the tagged error code, never file content                                                             |

Deleting an activity row cascades to its row here, but Storage has no cascade: the stored object is
removed by code (the upload rollback does this today; a delete service with UI is not built yet,
see Known limitations).

### Bucket and policies

- Bucket `activity-files`, private (no public URL), file size limit 10 MB. `allowed_mime_types` is
  left null: the extension and the content are checked in code, not by the bucket.
- Storage policies on `storage.objects` for this bucket: select, insert and delete only when
  `(storage.foldername(name))[1] = auth.uid()::text` and `roxcoach.has_access()`. The bucket lives
  in the shared project, so the policies are scoped to this bucket id and must not touch the other
  app's buckets. The migration inserts the bucket without `on conflict`, so it fails loudly if a
  bucket with that id already exists. Before applying 0008 on the shared project run
  `select id, public from storage.buckets where id = 'activity-files';` (must return no rows) and
  review `select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects';`:
  permissive policies of the other app with no `bucket_id` filter would also grant access to this bucket.
- The app never hands the client a public URL. Downloads (if ever needed) use a short-lived signed
  URL created on the server.

## Upload drawer

Component `UploadActivityDrawer` in `src/modules/dashboard/upload-activity-drawer.tsx` (rendered by
the shared `ActivityActions` component on Dashboard and Calendar). It opens from the right on
desktop and from the bottom on mobile, using
the shared `Drawer` default. Its title, close control, scrollable form body, Cancel button and
Upload action use `DrawerFormLayout`, the same layout as the race form. The form logic lives in
`use-upload-activity.ts` next to it (react-hook-form, zod schema, `detectHyroxHint`). Test ids:
`upload-activity-button`, `upload-activity-drawer`, `upload-close`, `upload-cancel`,
`upload-format-banner`,
`upload-file-input`, `upload-file-name`, `upload-file-error`, `upload-hyrox-checkbox`,
`upload-hyrox-label`, `upload-error`, `upload-submit`. Opened by an "Upload activity" button on
Dashboard and Calendar.

Contents, top to bottom:

1. Header with title "Upload activity", a one-line description ("Add a workout file exported from
   your watch or Strava.") and a close button.
2. **Banner** (an informational note, semantic tokens only, no fixed colors) with this copy:
   "Accepted formats: FIT, TCX and GPX (up to 10 MB). FIT is the best choice for Hyrox: it keeps
   the laps, so your stations can be matched. TCX merges the laps and GPX has none."
   Test id `upload-format-banner`.
3. File input (`accept=".fit,.tcx,.gpx"`), showing the chosen file name and size.
4. Checkbox "This is a Hyrox session". Unchecked by default, checked automatically when a TCX
   `Notes` text contains "HYROX". Hidden for GPX, which has no laps.
5. Footer with Cancel and Submit ("Upload"). On mobile they stack vertically at full width; on
   desktop they sit side by side and each fills half the footer. Submit is disabled until a valid
   file is chosen and shows a loading state during upload. Both dismissal buttons are disabled
   while uploading.

States: idle, uploading (button disabled, drawer stays open), error (message from the tagged error
class, shown inside the drawer, the file stays selected), success (the drawer closes, a plain toast
"Activity uploaded" appears without a link, the calendar and week strip refresh). While uploading
the drawer cannot be dismissed. The message shown on error is the `error` field of the response
(fixed strings in "Route behavior"), or "Something went wrong. Try again." when the body is not
readable. Client-side checks
(extension and size) give an immediate message but never replace the server checks below.

## Upload flow

1. The shared "Upload activity" action on Dashboard or Calendar opens a drawer
   (`src/components/ui/drawer.tsx`). See "Upload drawer" above.
2. The browser posts `FormData` to a route handler `src/app/api/activities/upload/route.ts`. tRPC
   does not carry multipart bodies, so this is the one non-tRPC entry point. The handler only
   checks the session and the access flag itself (the proxy matcher excludes `api/`), reads the
   file, and calls the `training` upload service. It holds no other logic.
3. The `upload-activity` service:
    1. Rejects a file over 10 MB (`ActivityFileTooLargeError`).
    2. `parseActivityFile` detects the real format from the content (FIT header `.FIT` at byte 8,
       `TrainingCenterDatabase` or `gpx` root element), never from the extension or file name
       (`UnsupportedActivityFileError` otherwise), then parses to the normalized result (below). A
       parse failure returns `ActivityFileParseError` and stores nothing.
    3. Hashes the bytes (sha256) and rejects a duplicate for that user: same hash, or an activity
       of that user with the same `started_at` (so the same workout in another format is also a
       duplicate). Both are `DuplicateActivityFileError`. The `started_at` check needs identical instants:
       a FIT and a GPX of the same workout whose starts differ by a second or more are not caught.
    4. Reads the athlete timezone through the `athlete` service and computes `local_date`.
    5. Builds the lap rows. With the "Hyrox" flag, `labelHyroxLaps` sets `station` (below); when any
       lap got a station the activity `category` is `hyrox`, otherwise the category of its sport.
    6. Writes the object to Storage at `<user_id>/<file_id>.<format>`, then the `activities` row,
       the laps and the `activity_files` row. If a later write fails, the activity (hard-deleted, laps
       cascade) and
       the object are removed, without masking the original error.
4. The response is `{ activityId }`. The drawer closes, shows the toast and invalidates the client
   calendar query (`getCalendar`), which refreshes both the calendar and week strip. The client does
   not navigate.

### Route behavior

`src/app/api/activities/upload/route.ts` exports `POST` and `maxDuration = 60`. The handler is built
by `createUploadHandler` in `helpers/upload-handler.helper.ts` (a Next route file may export only
HTTP verbs); the route wires in `getSession()` and `uploadActivity`. Checks run in this order, and
every error body is `{ "error": "<fixed message>" }`:

| Order | Check                                                        | Status | Message                                       |
| ----- | ------------------------------------------------------------ | ------ | --------------------------------------------- |
| 1     | Session lookup fails (infrastructure)                        | 500    | Something went wrong. Try again.              |
| 2     | No user                                                      | 401    | Sign in to upload                             |
| 3     | User without `app_metadata.roxcoach === true`                | 403    | You do not have access                        |
| 4     | `content-length` missing, invalid or above 10 MB plus 64 KiB | 413    | The file is larger than 10 MB                 |
| 5     | Body is not form data or has no `file` part                  | 422    | Choose a file to upload                       |
| 6     | `file.size` above 10 MB                                      | 413    | The file is larger than 10 MB                 |
| 7     | `UnsupportedActivityFileError`                               | 415    | This file is not a valid FIT, TCX or GPX file |
| 7     | `ActivityFileParseError`                                     | 422    | This file is not a valid FIT, TCX or GPX file |
| 7     | `DuplicateActivityFileError`                                 | 409    | This file was already uploaded                |
| 7     | `ActivityFileTooLargeError`                                  | 413    | The file is larger than 10 MB                 |
| 7     | Any other error or defect                                    | 500    | Something went wrong. Try again.              |

Authentication and the access check run before anything is read (the proxy matcher excludes
`api/`). The optional form field `hyrox` is `true` only when the string is `"true"`. Logs carry the
tag and `error_hash` only, never the file name or content.

Everything runs with the session-bound client, so RLS applies. No service-role client is needed.

### Known limitations

- Hosting limit: serverless hosts that cap request bodies (Vercel Functions reject bodies over
  about 4.5 MB before the handler runs, returning a non-JSON 413) make uploads between that cap
  and 10 MB fail with the generic error. If the app is hosted on such a platform, lower the limit
  everywhere (client schema, handler, service, bucket, banner copy, this spec) or move uploads to
  signed Storage URLs.
- An upload without a valid `content-length` header is rejected with 413 before the body is read.
  The header check allows 64 KiB of multipart overhead; the 10 MB limit applies to the file itself.
- A concurrent upload of the same workout in two formats has different hashes, so both can pass
  the `started_at` pre-check and create two activities. There is deliberately no unique index on
  `(user_id, started_at)`, because manual sessions entered by hand may share a start time.
  Same-bytes races are caught by the unique `(user_id, sha256)`. Until a delete UI exists, the extra activity stays.
- Re-uploading the same bytes after soft-deleting the activity stays rejected as a duplicate,
  because the `activity_files` row still exists. There is no delete UI yet, so nothing in the app
  can trigger this today.

## Normalized parse result

One type shared by all parsers, in `src/_bff/modules/training/types`:

| Field                                      | FIT source              | TCX and GPX source                    |
| ------------------------------------------ | ----------------------- | ------------------------------------- |
| `startedAt`                                | session start time      | first track point time                |
| `sportType`, `category`                    | `sport` and `sub_sport` | TCX `Sport`, GPX `type`, else `other` |
| `distanceM`, `movingTimeS`, `elapsedTimeS` | session totals          | TCX lap sums, GPX derived from points |
| `elevationGainM`                           | session ascent          | derived from point elevations         |
| `avgHr`, `maxHr`                           | session values          | derived from the heart rate extension |
| `avgSpeedMps`, `calories`                  | session values          | derived speed, calories null          |
| `laps`                                     | lap messages            | TCX laps, GPX empty                   |
| `name`                                     | file name, then sport   | `name` element, then sport            |

The mapping to `category` is a pure helper with tests. Hyrox is recognised from the laps, not from
the sport alone (see below).

### Station detection

Zepp writes no station names, so stations are inferred from the lap order. The removed Strava
detector is not reused. `labelHyroxLaps` (`helpers/label-hyrox-laps.helper.ts`) returns labels only
when the file has exactly 16 laps: even indexes are runs (no station), odd indexes are the stations
in race order (`HYROX_STATION_ORDER`). Any other lap count returns null and the laps are stored
unlabelled. It runs only when the athlete ticked "This is a Hyrox session" (default off, auto-ticked
when a TCX `Notes` contains "HYROX", hidden for GPX). When any lap is labelled, the activity
`category` becomes `hyrox`; otherwise it keeps the category of its sport. GPX has no laps, so it is
never labelled. Manual tagging stays described in [manual-logging.md](manual-logging.md).

### What a real Zepp Hyrox export contains

Checked against one short Hyrox test (Amazfit Bip 6, two stations, 2 minutes, no GPS):

| Aspect                    | FIT                                                                              | TCX                                  |
| ------------------------- | -------------------------------------------------------------------------------- | ------------------------------------ |
| Laps                      | 3, each with start, elapsed time, average heart rate, calories, trigger `manual` | 1 (everything merged)                |
| Lap labels                | none: no name, no station, no type                                               | none                                 |
| Sport                     | `sport` 10, `sub_sport` 23                                                       | `Sport="Other"`                      |
| Name                      | none                                                                             | `Notes` = "Corrida HYROX"            |
| Distance, speed, position | absent (indoor, no GPS)                                                          | absent                               |
| Heart rate                | per second, plus session min, average, max                                       | per second, plus lap average and max |

Consequences:

- Zepp does **not** write station names. The only signal is the lap boundaries (the athlete presses
  the lap button between segments). FIT keeps them, TCX merges them into one lap in this sample, so
  **FIT is the format to use for Hyrox** and TCX is only good for the whole-activity summary.
- A name-based detector cannot work on Zepp laps: the station can only be inferred from the lap
  order (run, station, run, station, and so on), and only when the activity is known to be a Hyrox
  one. That is what `labelHyroxLaps` does.
- Recognising a Hyrox activity: the TCX `Notes` text is the only marker found. FIT has no name and
  a generic sport. So the drawer asks the athlete to confirm "This is a Hyrox session" (default off,
  or on when the TCX note contains "HYROX"). When confirmed and the lap count matches the 16
  segments, laps are labelled in order; otherwise the laps are stored unlabelled and the athlete
  tags them by hand ([manual-logging.md](manual-logging.md)).
- Distance and speed will be null for indoor segments. Outdoor runs are expected to carry them
  (not yet seen in a real file).

## Parsing libraries

Parsing is server-only and runs in Node, never in the browser.

- FIT: `@garmin/fitsdk` (`^21.222.0`) in `parse-fit.helper.ts`. Name is the sport, else "Activity".
- TCX and GPX: `fast-xml-parser` (`^5.12.1`) through `xml.helper.ts`, with `parse-tcx.helper.ts` and
  `parse-gpx.helper.ts`. XML is untrusted: entity processing is off, a `DOCTYPE` or `ENTITY`
  declaration is rejected, only the five predefined entities are decoded (single pass), and
  namespace prefixes are stripped. Trees are validated with zod before use.
- A timestamp without a zone is read as UTC. TCX `movingTimeS` is null; the TCX average heart rate
  is the mean of the lap averages weighted by lap elapsed time. GPX has no laps and
  `movingTimeS = elapsedTimeS` (last minus first point time). TCX name is `Notes`, else the sport;
  GPX name is the track `name`, else "Activity".

## Errors

Tagged errors in `src/_bff/lib/errors.ts` (codes `TRAINING_FILE_*` in `error-codes.ts`):
`UnsupportedActivityFileError`, `ActivityFileParseError`, `DuplicateActivityFileError`,
`ActivityFileTooLargeError`, `ActivityFileStorageError`, plus `ActivityWriteError` for database
writes. The user sees only the fixed messages in "Route behavior" (415 and 422 share "This file is
not a valid FIT, TCX or GPX file"; storage and database failures are the generic 500). File content
and the original name never reach logs or error payloads.

## Tests

- Parsers: fixture files (a small FIT with laps, a Hyrox FIT and TCX from Zepp, a TCX with laps, a GPX with and without heart
  rate, a truncated file, a file with the wrong extension). Use real exports from Zepp and Strava.
- Service with a fake Supabase client and a fake storage client: success, duplicate hash, parse
  failure leaves nothing stored, database failure removes the object.
- Route handler: unauthenticated, no access flag, missing or oversized content-length, oversized file, error mapping.
- DB suites (`db/tests`): `activity_files` isolation, composite key, unique `(user_id, sha256)`.
- UI: drawer opens from the Dashboard and Calendar action group, banner text, form states (idle,
  uploading, error, success), all located by `data-testid`.

## Open questions

1. A full Hyrox export (16 segments, outdoor runs) to confirm the lap count and order, and that
   outdoor runs carry distance and speed. The sample so far had 2 stations and no GPS.
2. Whether to keep `sport_type` raw or map it only to `category` (the column exists).
3. Whether the Supabase plan of the shared project has enough Storage quota (check before first
   use).
