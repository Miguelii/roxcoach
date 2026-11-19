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

1. `strava.getConnectUrl` (protected query) builds
   `https://www.strava.com/oauth/authorize?client_id=...&response_type=code&redirect_uri=<site>/api/strava/callback&approval_prompt=auto&scope=read,activity:read_all&state=<state>`.
   `state` is a random value stored in a short-lived, `httpOnly`, `sameSite=lax` cookie and
   checked on return.
2. Strava redirects to `GET /api/strava/callback?code=...&scope=...&state=...`. The route verifies
   `state`, verifies the user session, checks the granted scope includes `activity:read_all`, then
   exchanges the code at `POST https://www.strava.com/oauth/token`.
3. The response (`access_token`, `refresh_token`, `expires_at`, `athlete.id`) is saved to
   `strava_connections` with the service-role client.
4. The route triggers an initial backfill job and redirects to `/settings`.

If the user denies access or grants too few scopes, redirect to `/settings` with a status the UI
shows as an error message. Nothing is stored.

Disconnect: `strava.disconnect` (protected mutation) calls `POST https://www.strava.com/oauth/deauthorize`
with the access token, then deletes the `strava_connections` row. Existing activities are kept.

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
connection only when the token refresh is rejected by Strava (400, 401 or 403, read twice) or
`GET /athlete` answers 401; success keeps it and 429, 5xx or network errors propagate for a retry.

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
  lap list). An activity whose athlete id differs from the connection's is refused. A `401` or `403` propagates
  and never removes the connection (a refresh race can produce a spurious one); only the webhook
  `athlete` update with `authorized: "false"` deletes it. Rate limits and 5xx propagate so the job
  retries.
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
activities since `last_synced_at` and syncs the missing ones. It covers missed webhooks and is the
recovery path when the subscription breaks.

## Backend files

| File                                                                                                                                                                                         | Purpose               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `controllers/get-connect-url.controller.ts`, `get-connection-status.controller.ts`, `disconnect.controller.ts`, `sync-now.controller.ts`                                                     | protected tRPC routes |
| `services/connect-strava.service.ts`, `get-valid-access-token.service.ts`, `sync-strava-activity.service.ts`, `sync-missing-activities.service.ts`, `handle-strava-webhook-event.service.ts` | business logic        |
| `repositories/strava-connections.repository.ts`, `strava-webhook-events.repository.ts`                                                                                                       | data access           |
| `helpers/map-strava-activity.helper.ts`, `detect-hyrox-stations.helper.ts`                                                                                                                   | pure logic            |
| `jobs/sync-strava-activity.job.ts`, `jobs/backfill-strava.job.ts`                                                                                                                            | Trigger.dev tasks     |

The training tables (`activities`, `activity_laps`) are written through the `training` module's
service (`upsertActivityFromStrava`), not directly from `strava` repositories.

The upsert is a lookup by `(user_id, strava_id)` followed by an update or an insert, not a PostgREST
`onConflict`: `activities_user_id_strava_id_key` is a partial unique index (`where strava_id is not
null`), which `ON CONFLICT (user_id, strava_id)` cannot infer through PostgREST. A unique violation
from a concurrent insert is resolved by looking the row up again and updating it. The update clears
`deleted_at`, so a re-created activity reappears.

## Compliance note

Strava's API Agreement restricts how API data may be used with AI and shown to others. Roxcoach is
private: one athlete, their own data, shown only to them, never used to train a model, only sent to
the model provider to write the weekly report for that same athlete. Re-read the current Strava API
Agreement before launch and before adding any second user. Include the required "Powered by
Strava" or "Compatible with Strava" attribution in Settings, and a link back to the original
activity on strava.com from the activity detail page.
