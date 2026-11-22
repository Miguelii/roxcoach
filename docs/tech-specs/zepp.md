# Zepp integration

Zepp (the app of the Amazfit watches) is a read-only source for the athlete's outdoor runs. The
athlete signs in once with the Zepp email and password in Settings, Integrations (the password field
has an eye button to show what was typed, `PasswordInput`), and starts each sync manually. Imported runs become normal Roxcoach run activities, so they appear in the calendar,
the activity detail, the run dashboard and the coach context. There is no scheduled or background
sync. Binding mocks: `mocks/zepp_history_mock.json` and `mocks/zepp_detail_mock.json` (real,
anonymized responses). Read them before touching the integration or reading a new field.

## Goals and scope

- Sign in with email and password, keep only the encrypted `app_token`, never the password.
- A manual `Sync` that imports new outdoor runs with their heart rate and pace histograms and their
  kilometre splits.
- Repeated syncs are idempotent and safe to retry or to press twice at once.
- Do not write, update or delete anything in Zepp.

Out of scope: Xiaomi, Google and Apple sign-ins, scheduled sync, GPS coordinates, the laps the athlete marks by hand, and the
workout types that have no mock yet: 6 (probably treadmill), 214 (Hyrox) and the rest. Type 52 looks
like strength and stays with Lyfta.

## The Zepp API

Zepp has no public personal API. This uses the internal API of the Zepp app (the same calls the open
source `huami-token` makes), which can change without notice. The server is the US one
(`api-mifit-us2.zepp.com`), which also served a European account.

| Call                                                                   | Purpose                                                                 |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `POST api-user-us2.zepp.com/v2/registrations/tokens`                   | Login step 1: encrypted form, answers 303 with `access` in the redirect |
| `POST api-mifit-us2.zepp.com/v2/client/login`                          | Login step 2: `code=<access>`, answers `token_info.app_token`           |
| `GET api-mifit-us2.zepp.com/v1/sport/run/history.json`                 | All workout summaries, header `apptoken`                                |
| `GET api-mifit-us2.zepp.com/v1/sport/run/detail.json?trackid=&source=` | The series of one workout, header `apptoken`                            |

The step 1 body is the form (`emailOrPhone`, `password`, `client_id=HuaMi` and the constants in
`zepp/constants`) encrypted with AES-128-CBC and a fixed key and IV ported from `huami-token` (MIT).
Data calls send `apptoken`, `appPlatform: web` and `appname: com.huami.midong`.

An invalid token is answered with HTTP 401 or 403, a non-JSON body, or a body whose `code` is not
`1`: all become `ZeppSessionExpiredError`. The token lifetime is unknown.

## Payload

History: `{ code: 1, message, data: { next, summary: [...] } }`. `next` is `-1` when there is no
more; the spike account returned its whole history (145 workouts) in one response, so paging is not
implemented. Every number may be a string or a number. Fields read: `trackid` (Unix seconds of the
start, also the stable id), `source`, `type`, `dis` (meters), `run_time` (moving seconds),
`end_time` (Unix seconds), `avg_heart_rate`, `max_heart_rate`, `calorie`, `sport_title`. A value of
zero or below for heart rate and calories means "no value".

Detail: strings of `;` separated `dt,value` entries, where `dt` is the seconds since the previous
entry and the running sum is the offset from `trackid`.

| Field             | Value                                                       |
| ----------------- | ----------------------------------------------------------- |
| `heart_rate`      | delta coded, first value absolute (`142,99;1,-1` is 99, 98) |
| `currentDistance` | cumulative centimeters                                      |
| `speed`           | meters per second, absolute                                 |

`kilo_pace` is the exception: `;` separated entries of comma separated values, one entry per full
kilometre. Checked against the mock run (3 entries for 3119 m): value 1 is the moving seconds of
that kilometre, value 4 its mean heart rate, value 5 the offset from `trackid` where it ends (370,
859, 1302), value 6 the moving milliseconds. The sum of the moving seconds plus the pauses matches the
offsets. The other values are not understood and not read. An entry with a missing or non positive
moving time or offset is dropped.

Checked against the mock run: 721 heart rate points ending at offset 1329 (`end_time - trackid`),
mean 143 (the summary says 143), last distance 3115 m (the summary says 3119 m).

## Import

`adaptZeppRun` (pure, `zepp/utils/adapter.utils.ts`) maps a summary and a detail to the normalized
activity: `startedAt` is `trackid`, `elapsedTimeS` is `end_time - trackid` (it includes the pauses
and the lead-in the watch counts before the first sample), `movingTimeS` and `distanceM` come from
the summary, category `run`, no elevation. Samples are one per distance point, with heart
rate and speed carried forward. The training import builds the heart rate and pace histograms from
them and stores the row with `source = 'zepp'` and `source_id = trackid`; there is no
`activity_files` row.

Laps (`buildZeppLaps`, `zepp/utils/laps.utils.ts`): one lap per `kilo_pace` entry, 1000 m, starting
where the previous one ended, with the moving time and heart rate of the entry and an elapsed time
that includes its pauses. The rest of the run after the last full kilometre becomes a last partial
lap when it is at least 10 m and has moving time left (summary distance and moving time minus the
full laps), with the mean heart rate of the series in that span. A run without `kilo_pace` entries
gets one lap for the whole run. The laps are written right after the activity; if writing them fails
the activity is deleted, so the next sync tries the run again.

Sync (`syncZeppActivities`): read the connection, fetch the history, keep type 1 with distance above
zero, newest first, drop the ids already imported, then fetch and import at most 50 details, spaced
500 ms apart. A run whose start is within 300 seconds of an activity the athlete already has from
another source (a hand uploaded Zepp file) is dropped before the batch is cut, with one range query,
so it never uses up the 50 details; an earlier Zepp activity does not count, so a stopped start-up run
cannot block the real one. A manual upload applies the same window, so a file uploaded after a sync
is also a duplicate. Runs imported before laps existed (a Zepp activity with no `activity_laps` row)
are fetched again with the budget the new runs leave, newest first, and get their laps; the activity
itself is not touched. A detail that Zepp refuses (HTTP error or `code` other than 1) is skipped for
that run only. There is no history window: the whole history is read every time. The unique `(user_id, source, source_id)` index turns a concurrent
second insert into "already imported". The result is `{ imported, skipped, updated, remaining }`, where
`updated` counts the runs that got their laps and `remaining` counts both the new runs and the runs
still without laps; the UI asks to press Sync again while `remaining` is above zero. An expired token aborts the sync.

## Sync button

The Dashboard and Calendar `Sync` button lists Zepp next to Lyfta. Its row syncs only Zepp. The result goes through a toast: "Zepp synced: Imported 2
runs.", "Added splits to 3 runs." or, while more remains, "Imported 50 runs. More runs to sync. Press Sync again to continue."

## Security

The password is used for the login call only. The `app_token` is encrypted at rest (AES-256-GCM,
`NEXT_ZEPP_ENCRYPTION_KEY`) in `zepp_connections`, a service-role-only table, and never reaches
logs, error payloads or the client. Errors never carry the upstream message.

## Errors

Codes `zepp001` to `zepp016` in `error-codes.ts`. The tRPC message is the error code and the client
maps it to copy (`src/modules/zepp/zepp-ui.utils.ts`).

## Open questions

- How long an `app_token` lasts.
- Paging when `next` is not `-1` (the parameter is not known).
- Types 6 and 214 (and Hyrox stations) need a real detail mock before they are imported.
