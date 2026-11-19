# Strava

The `strava` module connects the athlete's Strava account, receives new-activity events and keeps
the `activities` and `activity_laps` tables in sync. Activities are stored locally, so the app
and the coach never call Strava while rendering.

## Strava app registration

Done once by hand at strava.com/settings/api.

| Setting                       | Value                                              |
| ----------------------------- | -------------------------------------------------- |
| Authorization callback domain | the app's domain (and `localhost` for development) |
| Scopes requested              | `read,activity:read_all`                           |
| Webhook subscription          | created once with the script described below       |

## OAuth connection

Settings shows a "Connect Strava" button. Flow:

1. `strava.getConnectUrl` (protected mutation, because it sets a cookie) builds
   `https://www.strava.com/oauth/authorize?client_id=...&response_type=code&redirect_uri=<site>/api/strava/callback&approval_prompt=auto&scope=read,activity:read_all&state=<state>`.
   `<site>` is `NEXT_PUBLIC_WEBSITE_URL`. `state` is 32 random bytes as hex, stored in the
   `strava_oauth_state` cookie (`httpOnly`, `sameSite=lax`, `secure` in production,
   `path=/api/strava`, `maxAge` 600 seconds). The client secret never appears in the url.
2. Strava redirects to `GET /api/strava/callback?code=...&scope=...&state=...` (or `error=...`).
   The proxy matcher excludes `api/`, so the route checks the session itself: `getSession()`
   (`createDBServerClient` then `auth.getUser()`, never the JWT claims) must return a user with
   `app_metadata.roxcoach === true`, otherwise it redirects to `/login` and exchanges nothing. The
   user id always comes from the session, never from the query string.
3. `completeStravaConnect` then, in order: compares `state` with the cookie in constant time
   (`timingSafeEqual`; a missing value or a different length never matches) and fails on a
   mismatch, even when Strava reports a denial; returns `denied` when `error` is set or `code` is
   missing; returns `scope` when the granted `scope` parameter has no `activity:read_all` entry;
   only then exchanges the code at `POST https://www.strava.com/oauth/token`.
4. The response (`access_token`, `refresh_token`, `expires_at`, `athlete.id`) is saved to
   `strava_connections` with the service-role client, together with the granted scope and
   `connected_at = now()` (a reconnect replaces the previous date). A response without
   `athlete.id` stores nothing and fails.
5. The service enqueues the initial backfill. An enqueue failure is logged and does not undo the
   connection ("Sync now" recovers it).

The route redirects to `/settings?strava=connected|denied|scope|error`. `error` covers a state
mismatch, a failed exchange (a replayed code gets a 400) and any other failure. The redirect never
carries a token, code or error detail, and every response clears the state cookie. A failed
exchange, a 401 included, never deletes a connection. In every outcome but `connected`, nothing is
stored.

Disconnect: `strava.disconnect` (protected mutation) calls `POST https://www.strava.com/oauth/deauthorize`
with a valid access token (refreshed when needed), then deletes the `strava_connections` row.
The deauthorize call is best-effort: any failure, or no answer within 5 seconds, is logged by tag
and the row is deleted anyway. Existing activities are kept. Without a connection it succeeds.

Status: `strava.getStatus` (protected query) returns `{ connected, athleteId, connectedAt,
lastSyncedAt, activityCount }`, where `activityCount` counts live activities imported from Strava
(also after a disconnect). It never returns a token, the client secret or the scope string.

## Token refresh

Access tokens expire after about 6 hours. `getValidAccessToken` (service) reads the connection and,
if `expires_at` is less than 10 minutes away, calls `POST /oauth/token` with
`grant_type=refresh_token`, then saves the new `access_token`, `refresh_token` (it can change) and
`expires_at` **before** using the token. Concurrent refreshes are serialized by updating with the
previous `refresh_token` as a condition.

## Webhook

Route: `src/app/api/strava/webhook/route.ts`.

| Method | Behaviour                                                                                                                                             |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | Subscription validation. If `hub.verify_token` equals `NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN` return `200` with `{ "hub.challenge": <value> }`, else `403` |
| `POST` | Event intake. Respond `200` within 2 seconds, always                                                                                                  |

`POST` handling:

1. Parse the body: `object_type`, `object_id`, `aspect_type`, `owner_id`, `event_time`, `updates`.
2. Ignore events whose `owner_id` is not the connected `strava_athlete_id`.
3. Insert into `strava_webhook_events` (unique key makes redelivery a no-op), then trigger the
   `sync-strava-activity` job and return.
4. Event handling by type:

| Event                                           | Action                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `activity` + `create`                           | fetch and store the activity                                                        |
| `activity` + `update`                           | refetch and update the activity (title, sport type, privacy)                        |
| `activity` + `delete`                           | sync job: Strava's `404` confirms it, then `deleted_at` is set, never a hard delete |
| `athlete` + `update` with `authorized: "false"` | verification job: the connection is deleted only if Strava rejects the grant        |

The endpoint is unsigned, so anyone who knows an athlete id and an activity id could forge an event.
The handler therefore never does anything destructive inline: delete and deauthorization events are
confirmed with Strava by a job (`sync-strava-activity` for a delete, `verifyStravaDeauthorization`
for a deauthorization) before anything is removed. `verifyStravaDeauthorization` deletes the
connection only when the token refresh is rejected with `400` (an invalid grant, read twice) or
`GET /athlete` answers exactly `401`. A refresh `401` or `403` (a wrong client secret answers `401`)
and a `GET /athlete` `403` do not confirm anything: they keep the connection and propagate. Success
keeps it too, and 429, 5xx or network errors propagate for a retry.

The webhook never does heavy work inline. A subscription is created once with
`POST https://www.strava.com/api/v3/push_subscriptions` (client id, client secret, callback URL,
verify token), run by a documented one-time script in `tools/`, and the returned subscription id is
noted in the project README.

## Sync pipeline (`sync-strava-activity` job)

1. Load the connection and a valid access token.
2. `GET /api/v3/activities/{id}` for the summary.
3. `GET /api/v3/activities/{id}/laps` for laps.
4. Map and upsert into `activities` (keyed by `strava_id`) and replace `activity_laps` for it.
5. Detect Hyrox stations in the laps (see below).
6. Match the activity to a planned session (see [plan.md](plan.md)).
7. Mark the webhook event `processed` (or `failed` with a safe error message). The activity is
   picked up by the next weekly report.

The job is idempotent: upsert by `(user_id, strava_id)`, laps replaced in one transaction. It
retries on network errors and Strava 5xx responses, and treats `404` (deleted or private activity)
and `401` after a refresh attempt as non-retryable.

Backfill job: on first connect, page through `GET /api/v3/athlete/activities` for the last 12
months at 100 per page (`per_page=100`) and enqueue one sync per activity, throttled to stay under
the rate limit.

## Mapping

| Strava field                                                                                             | Column                                               |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `id`                                                                                                     | `strava_id`                                          |
| `name`                                                                                                   | `name`                                               |
| `sport_type`                                                                                             | `sport_type`, and `category` through the table below |
| `start_date`                                                                                             | `started_at`                                         |
| `start_date_local` plus the profile timezone                                                             | `local_date`                                         |
| `distance`                                                                                               | `distance_m`                                         |
| `moving_time`, `elapsed_time`                                                                            | `moving_time_s`, `elapsed_time_s`                    |
| `total_elevation_gain`                                                                                   | `elevation_gain_m`                                   |
| `average_heartrate`, `max_heartrate`                                                                     | `avg_hr`, `max_hr`                                   |
| `average_speed`                                                                                          | `avg_speed_mps`                                      |
| `calories`                                                                                               | `calories`                                           |
| lap `lap_index`, `name`, `distance`, `elapsed_time`, `moving_time`, `average_heartrate`, `average_speed` | `activity_laps` columns                              |

Missing values are stored as `NULL`.

| Strava `sport_type`                                            | `category`                                           |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| `Run`, `TrailRun`, `VirtualRun`                                | `run`                                                |
| `WeightTraining`, `Crossfit`                                   | `strength`                                           |
| `Workout`, `HighIntensityIntervalTraining`                     | `hyrox` when station laps are detected, else `cross` |
| `Rowing`, `Ride`, `Swim`, `Walk`, `Hike`, `Elliptical`, others | `cross` or `other`                                   |

The mapper is a pure helper (`helpers/map-strava-activity.helper.ts`) with unit tests.

## Sync services behaviour

- Services run in jobs and in the webhook route without a user session, so each creates its own
  service-role client.
- Station detection runs only for `Workout`, `HighIntensityIntervalTraining` and `Crossfit`
  activities: positional 16-lap detection cannot see distances, so other sport types never get
  station tags. After detection the category is recomputed with `hasStations`.
- A `404` on the activity soft-deletes the local activity (a `404` on the laps alone means an empty
  lap list). An activity whose athlete id differs from the connection's is refused (an activity with no
  `athlete` field is accepted: the fetch uses the owner's own token). A `401` or `403` propagates
  and never removes the connection (a refresh race can produce a spurious one); only the
  verification job deletes it, and only after Strava confirms (a `GET /athlete` `401`, or a refresh
  rejected with `400`). Rate limits and 5xx propagate so the job retries.
- Payloads are validated per activity. In a bulk sync a malformed activity (or a mapper error such
  as an invalid profile timezone) is skipped and logged with its id and error tag, and is not
  counted as synced. A single sync fails with `StravaPayloadError` instead.
- The bulk sync validates the profile timezone up front, waits 250 ms between activities and
  touches `last_synced_at`, with the time the run started, only when the whole run succeeds.
- The webhook handler ignores unknown object or aspect types, unknown `owner_id` values (no row is
  written, so nothing reveals whether an athlete exists) and redelivered events. `event_time` is
  epoch seconds and is stored as an ISO timestamp.

## Hyrox lap detection

Strava has no concept of Hyrox stations, so detection is by lap structure plus naming:

- A Hyrox race or simulation has 16 laps: 8 runs of about 1 km alternating with 8 stations.
  Station order: SkiErg, Sled Push, Sled Pull, Burpee Broad Jumps, Rowing, Farmers Carry, Sandbag
  Lunges, Wall Balls.
- `detectHyroxStations(laps)` returns the station tag per lap when the lap count is 16, or when
  lap names contain recognisable station names. Otherwise it returns nothing and the athlete can
  tag stations by hand (see [manual-logging.md](manual-logging.md)).
- Detection is conservative: a wrong tag is worse than no tag. Unit tests cover a clean 16-lap
  sequence, a partial session and a normal run.

## Rate limits

The default Strava limits are 100 requests per 15 minutes and 1000 per day. One synced activity
costs 2 requests, so normal use is far below the limit. The backfill is throttled (a short delay
between activities) and stops with a retry-later when a `429` is returned, honouring the
`X-RateLimit-*` headers.

## Manual sync

A "Sync now" button in Settings (`strava.syncNow`, protected mutation) enqueues a job that lists
activities since `last_synced_at` and syncs the missing ones. Without a connection it fails with
`PRECONDITION_FAILED`. It covers missed webhooks and is the
recovery path when the subscription breaks.

## Backend files

| File                                                                                                                                                                                                                                                                                                                            | Purpose                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `controllers/get-connect-url.controller.ts`, `get-status.controller.ts`, `disconnect.controller.ts`, `sync-now.controller.ts`                                                                                                                                                                                                   | protected tRPC routes (`strava.router.ts`) |
| `services/start-strava-connect.service.ts`, `complete-strava-connect.service.ts`, `disconnect-strava.service.ts`, `get-strava-status.service.ts`, `sync-now.service.ts`, `get-valid-access-token.service.ts`, `sync-strava-activity.service.ts`, `sync-missing-activities.service.ts`, `handle-strava-webhook-event.service.ts` | business logic                             |
| `repositories/strava-connections.repository.ts`, `strava-webhook-events.repository.ts`                                                                                                                                                                                                                                          | data access                                |
| `helpers/map-strava-activity.helper.ts`, `detect-hyrox-stations.helper.ts`, `strava-oauth-state.helper.ts`                                                                                                                                                                                                                      | pure logic                                 |
| `jobs/sync-strava-activity.job.ts`, `jobs/verify-strava-deauthorization.job.ts`, `jobs/backfill-strava.job.ts`, `jobs/sync-missing-strava.job.ts`                                                                                                                                                                               | Trigger.dev tasks                          |

The training tables (`activities`, `activity_laps`) are written through the `training` module's
service (`upsertActivityFromStrava`), not directly from `strava` repositories.

The upsert is a lookup by `(user_id, strava_id)` followed by an update or an insert, not a PostgREST
`onConflict`: `activities_user_id_strava_id_key` is a partial unique index (`where strava_id is not
null`), which `ON CONFLICT (user_id, strava_id)` cannot infer through PostgREST. A unique violation
from a concurrent insert is resolved by looking the row up again and updating it. The update clears
`deleted_at`, so a re-created activity reappears.

## Jobs and enqueueing

- Jobs: `sync-strava-activity` (`{ userId, stravaActivityId, eventId }`), `verify-strava-deauthorization`
  (`{ userId, eventId }`, concurrency limit 1 so two verifications never race on a token refresh),
  `backfill-strava` and `sync-missing-strava` (`{ userId }`). Payloads carry ids only, never tokens.
- Retries: a `401`/`403`, a missing connection and a malformed payload are not retried. A `429`
  retries at `Retry-After`, and at least 15 minutes later when the header is missing (the limits are
  per 15-minute window). 5xx and network errors use exponential backoff (5 attempts for an activity
  sync).
- Outcomes: when the payload has an `eventId`, success marks the webhook event `processed` and a final
  failure marks it `failed` with a fixed message (`<error tag>:<error hash>`), never a cause.
- Enqueue (`enqueue-strava-jobs.service.ts`) never throws and never calls the SDK without
  `TRIGGER_SECRET_KEY` (it fails with `EnqueueStravaJobError`). Idempotency keys debounce forged
  unsigned events: `<userId>:<stravaActivityId>` for 60 seconds (an edit a minute after the upload
  still syncs), `<userId>:verify` for 5 minutes,
  `<userId>:backfill` for an hour, a per-minute key for sync-missing.
- A `429` is retried while attempts remain; after the last attempt the run fails (and the event is
  marked `failed`) instead of waiting again.
- The bulk sync skips activities that are already stored and live for the user (one existence query
  per list page), so a run retried after a rate limit continues where it stopped and a large history
  converges. A soft-deleted activity is not skipped (it is re-synced and reappears). An already
  stored activity is not refreshed by the bulk sync: edits arrive through the webhook.

## Compliance note

Strava's API Agreement restricts how API data may be used with AI and shown to others. Roxcoach is
private: one athlete, their own data, shown only to them, never used to train a model, only sent to
the model provider to write the weekly report for that same athlete. Re-read the current Strava API
Agreement before launch and before adding any second user. Include the required "Powered by
Strava" or "Compatible with Strava" attribution in Settings, and a link back to the original
activity on strava.com from the activity detail page.
