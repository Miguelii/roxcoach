# Manual upload

The athlete adds an activity by uploading the file exported from Strava (or any device). This
replaces the removed Strava sync. Status: spec only, nothing is built yet.

## Goal and scope

- A button on the dashboard opens an upload drawer. One file per upload: `.fit`, `.tcx` or `.gpx`.
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

Decision: **support all three, one parser interface.** Each parser returns the same normalized
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

Deleting an activity deletes its row here and the stored object (done by the delete service,
Storage has no cascade).

### Bucket and policies

- Bucket `activity-files`, private (no public URL), file size limit 10 MB, allowed extensions `fit`
  `tcx` and `gpx`.
- Storage policies on `storage.objects` for this bucket: select, insert and delete only when
  `(storage.foldername(name))[1] = auth.uid()::text` and `roxcoach.has_access()`. The bucket lives
  in the shared project, so the policies are scoped to this bucket id and must not touch the other
  app's buckets.
- The app never hands the client a public URL. Downloads (if ever needed) use a short-lived signed
  URL created on the server.

## Upload drawer

Component `src/modules/dashboard/upload-activity-drawer.tsx` with the form logic in
`use-upload-activity.ts` next to it. Opened by an "Upload activity" button on the dashboard.

Contents, top to bottom:

1. Title "Upload activity" and a one-line description.
2. **Banner** (an informational note, semantic tokens only, no fixed colors) with this copy:
   "Accepted formats: FIT, TCX and GPX (up to 10 MB). FIT is the best choice for Hyrox: it keeps
   the laps, so your stations can be matched. TCX merges the laps and GPX has none."
   Test id `upload-format-banner`.
3. File input (`accept=".fit,.tcx,.gpx"`), showing the chosen file name and size.
4. Checkbox "This is a Hyrox session". Unchecked by default, checked automatically when a TCX
   `Notes` text contains "HYROX". Hidden for GPX, which has no laps.
5. Submit button ("Upload"), disabled until a valid file is chosen, with a loading state.

States: idle, uploading (button disabled, drawer stays open), error (message from the tagged error
class, shown inside the drawer, the file stays selected), success (the drawer closes, a toast
"Activity uploaded" appears with a link, the calendar and week strip refresh). Client-side checks
(extension and size) give an immediate message but never replace the server checks below.

## Upload flow

1. The dashboard button "Upload activity" opens a drawer (`src/components/ui/drawer.tsx`, already
   in the project). See "Upload drawer" below. The form follows the project pattern
   (react-hook-form, zod schema in the hook file).
2. The browser posts `FormData` to a route handler `src/app/api/activities/upload/route.ts`. tRPC
   does not carry multipart bodies, so this is the one non-tRPC entry point. The handler only
   checks the session and the access flag itself (the proxy matcher excludes `api/`), reads the
   file, and calls the `training` upload service. It holds no other logic.
3. The `upload-activity` service:
    1. Rejects a file over 10 MB or with an extension other than `fit`, `tcx` or `gpx`.
    2. Detects the real format from the content (FIT header `.FIT` at byte 8, `TrainingCenterDatabase` or `gpx` root element),
       never from the extension alone.
    3. Hashes the bytes (sha256) and rejects a duplicate for that user.
    4. Parses to the normalized result (below). A parse failure returns a tagged error and stores
       nothing.
    5. Reads the athlete timezone through the `athlete` service and computes `local_date`.
    6. Writes the object to Storage, then the `activities` row, the laps and the
       `activity_files` row. If a database write fails after the upload, the object is removed.
4. The response is the new activity id. The client invalidates the calendar and week strip queries
   and navigates to the activity.

Everything runs with the session-bound client, so RLS applies. No service-role client is needed.

### Known limitations

- A concurrent upload of the same workout in two formats has different hashes, so both can pass
  the `started_at` pre-check and create two activities. There is deliberately no unique index on
  `(user_id, started_at)`, because manual sessions entered by hand may share a start time.
  Same-bytes races are caught by the unique `(user_id, sha256)`. The athlete can delete one later.
- Re-uploading the same bytes after soft-deleting the activity stays rejected as a duplicate,
  because the `activity_files` row still exists. There is no delete UI yet, so this is intended
  for now.

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

Zepp records the Hyrox stations in its export, so FIT and TCX laps can carry them. The removed
Strava code had a detector (`detect-hyrox-stations.helper.ts`), recoverable from git history
(`git show 84f5f45:src/_bff/modules/strava/helpers/detect-hyrox-stations.helper.ts`). It is reused
on the parsed laps: when the sequence matches 8 runs and 8 stations it sets `activity_laps.station`
and the activity `category` to `hyrox`. Otherwise the laps are stored plain and the activity keeps
the category of its sport. GPX has no laps, so it is never detected. Manual tagging stays described
in [manual-logging.md](manual-logging.md).

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
- The old detector cannot be reused as it was: it expected labelled laps. With Zepp laps the
  station can only be inferred from the lap order (run, station, run, station, and so on), and only
  when the activity is known to be a Hyrox one.
- Recognising a Hyrox activity: the TCX `Notes` text is the only marker found. FIT has no name and
  a generic sport. So the drawer asks the athlete to confirm "This is a Hyrox session" (default off,
  or on when the TCX note contains "HYROX"). When confirmed and the lap count matches the 16
  segments, laps are labelled in order; otherwise the laps are stored unlabelled and the athlete
  tags them by hand ([manual-logging.md](manual-logging.md)).
- Distance and speed will be null for indoor segments. Outdoor runs are expected to carry them
  (not yet seen in a real file).

## Parsing libraries

Parsing is server-only and runs in Node, never in the browser. Candidates to evaluate in the plan:
the official Garmin FIT SDK for JavaScript (`@garmin/fitsdk`) for FIT, and `fast-xml-parser` for
TCX and GPX. Pick by bundle behavior under Next.js and by test results against real files, and check
current versions and licenses at implementation time.

## Errors

New tagged errors in `src/_bff/lib/errors.ts` with codes in `error-codes.ts`: unsupported or
oversized file, unreadable file, duplicate file, empty activity (no start time), storage write
failure, database write failure. The response shows a generic message per class ("This file is not
a valid FIT, TCX or GPX file", "This file was already uploaded"). File content and the original name
never reach logs or error payloads.

## Tests

- Parsers: fixture files (a small FIT with laps, a Hyrox FIT and TCX from Zepp, a TCX with laps, a GPX with and without heart
  rate, a truncated file, a file with the wrong extension). Use real exports from Zepp and Strava.
- Service with a fake Supabase client and a fake storage client: success, duplicate hash, parse
  failure leaves nothing stored, database failure removes the object.
- Route handler: unauthenticated, no access flag, oversized body.
- DB suites (`db/tests`): `activity_files` isolation, composite key, unique `(user_id, sha256)`.
- UI: drawer opens from the dashboard button, banner text, form states (idle, uploading, error, success), all located by `data-testid`.

## Open questions

1. A full Hyrox export (16 segments, outdoor runs) to confirm the lap count and order, and that
   outdoor runs carry distance and speed. The sample so far had 2 stations and no GPS.
2. Whether to keep `sport_type` raw or map it only to `category` (the column exists).
3. Whether the Supabase plan of the shared project has enough Storage quota (check before first
   use).
