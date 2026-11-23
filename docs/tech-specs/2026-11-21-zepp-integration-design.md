# Zepp integration and Settings Integrations tab

> Superseded for sync behavior (background run, lease, limits) by
> [2026-11-23-background-sync-design.md](2026-11-23-background-sync-design.md).

## Intent

The athlete records runs and Hyrox sessions on an Amazfit Bip 6 through the Zepp app. Today they
only enter Roxcoach by manual file upload. The goal is a Zepp sync button, like the Lyfta one, that
pulls workouts straight from the watch's cloud, for free. Zepp has no public personal API, so the
integration uses the internal API the Zepp app itself uses (accepted: Roxcoach is a private app).

Alongside, Settings gets an "Integrations" tab that replaces the "Lyfta" tab and lists every
integration (Lyfta and Zepp now, more later).

## Goals

- `/settings` tab "Integrations" with one card per integration: Lyfta (moved as is) and Zepp.
- Zepp: sign in once with the Zepp email and password, sync on demand, disconnect.
- Imported workouts become normal Roxcoach activities with full streams, so pace, zone and heart
  rate charts work unchanged.
- Repeated syncs are idempotent and safe to retry after partial failure.
- Each integration owns its upstream model and an adapter to the Roxcoach model. Adding an
  integration never changes the Roxcoach activity schema beyond provenance fields.

## Non-goals and anti-goals

- No scheduled or background sync, no writes to Zepp, no Xiaomi, Google or Apple Zepp logins.
- Anti-goal: storing the Zepp password. It is used for one login and discarded.
- Anti-goal: the Zepp token leaking. It never reaches logs, error payloads or the client.
- Anti-goal: duplicates of workouts already uploaded by hand (FIT or TCX exported from Zepp).

## Approaches considered

1. **Zepp internal API, login once, store only the token (picked).** Automatic from any device.
   Cost: when the token expires the athlete signs in again.
2. Zepp internal API storing the password encrypted for silent re-login. Rejected: a password at
   rest is a far worse secret and breaks the project rule.
3. Strava scraping with a session cookie. Dropped by the athlete: the watch is the real source.
4. Gadgetbridge or Health Connect export. Rejected: needs a phone app, not automatic in a web app.

## Spike findings (2026-11-21, real account, `mocks/zepp_*.json`)

- **Login:** the two step flow from the open source `huami-token` (Zepp `v2/registrations/tokens`
  with an AES encrypted form, then `api-mifit-us2.zepp.com/v2/client/login`) returns `app_token`,
  `login_token` and `user_id`. Token lifetime not measured yet.
- **List:** `GET https://api-mifit-us2.zepp.com/v1/sport/run/history.json` with header
  `apptoken` returns `{ code: 1, message, data: { next, summary: [...] } }`. `next: -1` means no
  more pages (the account had 145 workouts in one response; paging with `stopTime` is to confirm).
  Every value arrives as a string. `-1`, `-20000` and `-274.0` are "no value" sentinels. Useful
  fields: `trackid` (start time in Unix seconds), `source`, `type`, `dis` (meters), `run_time` and
  `end_time` (seconds), `avg_heart_rate`, `max_heart_rate`, `calorie`, `altitude_ascend`,
  `syncedTimezone`, `hyroxRace`, `totalTimeWithMillis`.
- **Types seen:** 1 (67, outdoor run), 52 (42), 16 (20), 6 (10), 214 (3, Hyrox), 17, 24, 60.
  Only 1 and 214 are confirmed by matching known workouts.
- **Detail:** `GET .../v1/sport/run/detail.json?trackid=&source=` returns delta encoded strings:
  `longitude_latitude` (1e-8 degrees, first pair absolute, `lat,lon`), `time` (second deltas),
  `heart_rate` (`dt,dHR` pairs), `pace`, `speed`, `currentDistance`, `altitude`
  (`-2000000` = none), `gait` (cadence in the fourth value), `kilo_pace` (km splits), `pause`,
  plus `hyroxTimelines`, `hyroxBlocks`, `hyroxRepLap` (empty for a run).

## Design

### Integrations tab

`src/modules/settings/lyfta-tab.tsx` becomes an `integrations-tab.tsx` that stacks one card per
integration (`lyfta-integration-card.tsx`, `zepp-integration-card.tsx`). The Lyfta card keeps its
current behavior and test ids. The tab id and copy change from "Lyfta" to "Integrations".

### Zepp module `src/_bff/modules/zepp`

Mirrors `lyfta`: controllers `connect`, `disconnect`, `get-connection-status`, `sync-workouts`, a
`zepp-connections` repository, `zepp-api.service.ts` (login, list, detail), and a sync service.

- **Upstream model:** zod schemas for the history summary and the detail, built from the mocks,
  in `zepp/types` and `zepp/utils`. Sentinels become `null`. Delta strings are decoded by pure,
  tested helpers.
- **Adapter:** `zepp/utils/adapter.utils.ts` turns a summary plus detail into the existing
  `ParsedActivity` (the normalized result manual uploads already produce), so storage, laps,
  histograms, category and Hyrox detection reuse the current training pipeline.
- **Connect:** the athlete enters email and password; the server logs in, stores `app_token`
  encrypted with the same credential utils as the Lyfta key, and discards the password.
- **Expired token:** any auth failure from Zepp becomes a tagged `ZeppSessionExpiredError` with UI
  copy asking to sign in again, and marks the connection as needing a new sign in.

### Database

One migration: a `zepp_connections` table like `lyfta_connections`, and provenance on
`activities` (`source` plus `source_id`, unique per user when present) so known `trackid`s are
skipped. Exact columns follow `database.md` conventions.

## Calls left to the builder (marked as my calls)

- Types imported in the MVP: only 1 (outdoor run), the one confirmed against a known workout.
  Types 6 (likely treadmill) and 214 (Hyrox) wait for a real detail mock; 52 looks like strength
  and stays with Lyfta to avoid double strength activities.
- Duplicates: skip a workout whose `trackid` is known, or whose start is within 60 seconds of an
  existing activity of that user (hand uploaded files).
- Totals from the summary (Zepp's own numbers), streams from the detail.
- Requests spaced about 500 ms, at most 50 details per sync, so a long history lands in a few presses.
- Hyrox: a Hyrox detail mock is needed before station mapping; until then Hyrox workouts are not imported.
- Only `app_token` is stored (the detail and history calls need nothing else), not `user_id`.
- No coordinates or laps are decoded: the normalized activity has neither, and GPX gives no laps either.

## Specs to update with the change

`docs/tech-specs/README.md` (data sources), a new `docs/tech-specs/zepp.md`, `lyfta.md` (Settings
tab move), `database.md`, `manual-upload.md` (shared import path), and `CLAUDE.md` (Zepp mock rule
like the Lyfta one).
