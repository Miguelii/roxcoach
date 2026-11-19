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
| `POST` | Event intake. Responds `200` with an empty JSON object whatever happens, except a body that is not JSON (`400`)                                       |

`POST` handling:

1. Parse the body: `object_type`, `object_id`, `aspect_type`, `owner_id`, `event_time`, `updates`.
2. Ignore events whose `owner_id` is not the connected `strava_athlete_id`.
3. Insert into `strava_webhook_events` (unique key makes redelivery a no-op), then the route
   enqueues the `sync-strava-activity` job (or `verify-strava-deauthorization`) and returns. If
   the enqueue fails, the event is marked `failed` with the fixed message `enqueue_failed` (through
   `settleStravaEvent`, which never rejects), and the response is still `200`. There is no hard
   timeout: the work is bounded by capping the SDK retries instead (the webhook-path enqueue sends
   the request option `retry: { maxAttempts: 1 }`, so one failed attempt is final).
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

Accepted risk: the webhook is unsigned and the athlete id is public, so forged traffic can write
`strava_webhook_events` rows and cost Strava calls, up to the app's rate limit (the debounce and
idempotency keys below collapse repeats, and nothing destructive happens without Strava's
confirmation). A callback URL secret (`?k=<secret>` checked on both methods) would be a cheap bound;
it is known and deferred.

The webhook never does heavy work inline. A subscription is created once with
`POST https://www.strava.com/api/v3/push_subscriptions` (client id, client secret, callback URL,
verify token), run by the one-time script `tools/strava-subscription.ts`. The script reads
`NEXT_STRAVA_CLIENT_ID`, `NEXT_STRAVA_CLIENT_SECRET`, `NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN` and
`NEXT_PUBLIC_WEBSITE_URL` from the environment (for example `set -a; source .env.local; set +a`),
the callback URL is `<site>/api/strava/webhook`, and the app must already be deployed and
reachable because Strava calls the GET validation during creation:

```
pnpm dlx tsx tools/strava-subscription.ts create        # creates it, prints the subscription id
pnpm dlx tsx tools/strava-subscription.ts view          # prints the current subscription id
pnpm dlx tsx tools/strava-subscription.ts delete <id>   # deletes that subscription
```

The script never prints the client secret, the verify token or a Strava response body. Strava
allows one subscription per app, so `view` first when `create` is refused.

## Sync pipeline (`sync-strava-activity` job)

1. Load the connection and a valid access token.
2. `GET /api/v3/activities/{id}` for the summary.
3. `GET /api/v3/activities/{id}/laps` for laps.
4. Map and upsert into `activities` (keyed by `strava_id`) and replace `activity_laps` for it
   (delete the old laps, then insert the new ones).
5. Detect Hyrox stations in the laps (see below).
6. Planned, not built (coach and plan work, plan 5): match the activity to a planned session (see
   [plan.md](plan.md)).
7. Mark the webhook event `processed` (or `failed` with a safe error message). A debounced run
   (see "Jobs and enqueueing") carries only the last event of a burst, so on success the other
   events of the same activity that are still `received` are marked `processed` too. Planned, not
   built (plan 5): the activity is picked up by the next weekly report.

The job is idempotent: upsert by `(user_id, strava_id)`, laps replaced by delete then insert. That
is not atomic: if the insert fails the activity is left without laps and the failed sync is
retried, which rewrites them. The job retries on network errors and Strava 5xx responses, and
treats a `404` (the activity was deleted) as a soft delete and a `401` or `403` as non-retryable.

Backfill job: on first connect, page through `GET /api/v3/athlete/activities` at 100 per page
(`per_page=100`) and sync each activity that is not stored yet in the same run, waiting 250 ms
between activities to stay under the rate limit. Strava lists `after=` results oldest first, so the
job runs two passes: the last 35 days first (this pass does not stamp `last_synced_at`), then the
full 12 months. The second pass skips what the first stored, so the overlap costs list pages only.
See "How a large history converges" below.

## Mapping

| Strava field                                                                                             | Column                                               |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `id`                                                                                                     | `strava_id`                                          |
| `name`                                                                                                   | `name`                                               |
| `sport_type`                                                                                             | `sport_type`, and `category` through the table below |
| `start_date`                                                                                             | `started_at`                                         |
| `start_date` converted to the profile timezone                                                           | `local_date`                                         |
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
between activities) and stops when a `429` is returned. Only the `Retry-After` header is read (the
`X-RateLimit-*` headers are not), with a 15 minute floor when it is missing.

## Manual sync

A "Sync now" button in Settings (`strava.syncNow`, protected mutation) enqueues the
`sync-missing-strava` job, which lists activities since 7 days before `last_synced_at` (the 12 month
window when the connection never synced) and syncs the missing ones. Strava's `after` filters on
the activity start date, not the upload time, so the 7 day overlap finds an activity recorded
before the last sync and uploaded later; stored activities are skipped, so it costs about one list
page. Without a connection it fails with
`PRECONDITION_FAILED`. It covers missed webhooks and is the recovery path when the subscription
breaks.

## Settings card

`/settings` renders only the Strava card for now (profile and availability return with a later
plan). Files: `src/modules/settings/strava-card.tsx` (thin wrapper over the tRPC procedures),
`strava-card-view.tsx` (presentational, data and actions through props), `settings-view.tsx`
(reads `searchParams` inside a `Suspense` boundary) and `strava-result.ts`.

- Disconnected: only "Connect Strava", which calls `strava.getConnectUrl` and then
  `window.location.assign(url)`.
- Connected: last sync ("Not synced yet" when there is none), the activity count, "Sync now" and
  "Disconnect". Disconnect asks for a second confirmation click first and says imported activities
  stay.
- The `?strava=` value from the callback is validated against `connected`, `denied`, `scope` and
  `error`; anything else is ignored and query text is never rendered. The messages are "Strava
  connected", "You did not allow access", "Roxcoach needs permission to read all your activities"
  and "Something went wrong, try again".
- A failed mutation shows a toast with fixed copy (never the server error) and keeps the buttons
  usable. A failed status load shows an error with a retry button.
- The card always shows "Compatible with Strava". It never receives or renders a token.

## Backend files

| File                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Purpose                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `controllers/get-connect-url.controller.ts`, `get-status.controller.ts`, `disconnect.controller.ts`, `sync-now.controller.ts`                                                                                                                                                                                                                                                                                                                                                             | protected tRPC routes (`strava.router.ts`)                                                                                                 |
| `services/start-strava-connect.service.ts`, `complete-strava-connect.service.ts`, `disconnect-strava.service.ts`, `get-strava-status.service.ts`, `sync-now.service.ts`, `get-valid-access-token.service.ts`, `sync-strava-activity.service.ts`, `sync-missing-activities.service.ts`, `handle-strava-webhook-event.service.ts`, `verify-strava-deauthorization.service.ts`, `enqueue-strava-jobs.service.ts`, `resolve-sync-missing-window.service.ts`, `settle-strava-event.service.ts` | business logic                                                                                                                             |
| `repositories/strava-connections.repository.ts`, `strava-webhook-events.repository.ts`                                                                                                                                                                                                                                                                                                                                                                                                    | data access                                                                                                                                |
| `helpers/map-strava-activity.helper.ts`, `detect-hyrox-stations.helper.ts`, `strava-oauth-state.helper.ts`, `strava-schemas.helper.ts`, `webhook-payload.helper.ts`                                                                                                                                                                                                                                                                                                                       | pure logic                                                                                                                                 |
| `helpers/strava-api.client.ts`, `strava-credentials.helper.ts`, `strava-job.helper.ts`, `webhook-route.helper.ts`                                                                                                                                                                                                                                                                                                                                                                         | not pure: the Strava HTTP client, credential reading (`ServerEnv`), the job wrapper and `catchError` hook, the webhook handlers (they log) |
| `jobs/sync-strava-activity.job.ts`, `jobs/verify-strava-deauthorization.job.ts`, `jobs/backfill-strava.job.ts`, `jobs/sync-missing-strava.job.ts`                                                                                                                                                                                                                                                                                                                                         | Trigger.dev tasks                                                                                                                          |

The athlete profile timezone is read through the `athlete` module's service
(`getAthleteTimezoneWithClient`, which takes the caller's client), never its repository.

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
  per 15-minute window). 5xx and network errors use exponential backoff. Attempts: 5 for an
  activity sync, 4 for a verification, 20 for the bulk jobs (`backfill-strava`, `sync-missing-strava`).
- Outcomes: when the payload has an `eventId`, success marks the webhook event `processed` and a final
  failure marks it `failed` with a fixed message (`<error tag>:<error hash>`), never a cause.
- Job environment: jobs run in Trigger.dev's cloud with their own variables (see
  [architecture.md](architecture.md#trigger-dev-jobs)); a missing one fails the run at runtime.
- Enqueue (`enqueue-strava-jobs.service.ts`) never throws and never calls the SDK without
  `TRIGGER_SECRET_KEY` (it fails with `EnqueueStravaJobError`). Repeated events are collapsed:
    - Activity sync: the SDK `debounce` option (`key: <userId>:<stravaActivityId>`, `delay: 30s`,
      `maxDelay: 5m`, `mode: trailing`). A burst (create, then edits) becomes one delayed run that
      carries the last event and fetches the final state, so an edit is never lost; a trigger after
      the run started creates a new run. The payload holds only the last event's `eventId`: that event
      is settled by id, and the earlier events of the activity that are still `received` are settled
      `processed` when the run succeeds. After a failed run they stay `received` (accepted: the
      tracked event carries the failure).
    - Verification: idempotency key `<userId>:verify` for 5 minutes. Backfill: `<userId>:backfill`
      for an hour. Sync missing: a per-minute key.
    - The webhook-path enqueues (activity sync, verification) send the request option
      `retry: { maxAttempts: 1 }`, so a POST never waits for several SDK retries.
- A `429` is retried while attempts remain; after the last attempt the run fails (and the event is
  marked `failed`) instead of waiting again.
- The bulk sync skips activities that are already stored and live for the user (one existence query
  per list page). A soft-deleted activity is not skipped (it is re-synced and reappears). An already
  stored activity is not refreshed by the bulk sync: edits arrive through the webhook.
- How a large history converges: syncing an activity costs 2 requests and the read limit is 100 per
  15 minutes, so about 49 activities fit in one attempt. A `429` stops the attempt and Trigger waits
  `Retry-After` (at least 15 minutes) before the next one, up to 20 attempts, and every attempt
  skips what is already stored. The backfill syncs the last 35 days first, so the recent weeks that
  drive the dashboard arrive before the older history, then the rest of the 12 months, oldest
  first. The pass over 35 days does not stamp `last_synced_at`: it is stamped only when the full
  pass finishes, so a history that did not finish leaves it empty and "Sync now" resumes from the
  12 month window (skipping stored activities). A history of more than about 900 activities in 20
  attempts can still end in a final failure; "Sync now" continues it.

## Routes

| Route                                  | Purpose                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/app/api/strava/callback/route.ts` | OAuth redirect handler (checks its own session)                                                          |
| `src/app/api/strava/webhook/route.ts`  | `GET` subscription validation, `POST` event intake (wires `createStravaWebhookHandlers` to the services) |

## Compliance note

Strava's API Agreement restricts how API data may be used with AI and shown to others. Roxcoach is
private: one athlete, their own data, shown only to them, never used to train a model, only sent to
the model provider to write the weekly report for that same athlete. Re-read the current Strava API
Agreement before launch and before adding any second user. Include the required "Powered by
Strava" or "Compatible with Strava" attribution in Settings, and a link back to the original
activity on strava.com from the activity detail page.
