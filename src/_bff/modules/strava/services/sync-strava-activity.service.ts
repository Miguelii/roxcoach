import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError, StravaNotConnectedError, StravaPayloadError } from '@/_bff/lib/errors'
import { getAthleteTimezoneWithClient } from '@/_bff/modules/athlete/services/get-athlete-timezone-with-client.service'
import { detectHyroxStations } from '@/_bff/modules/strava/helpers/detect-hyrox-stations.helper'
import {
    mapStravaActivity,
    mapStravaCategory,
    mapStravaLaps,
} from '@/_bff/modules/strava/helpers/map-strava-activity.helper'
import { stravaApiGet } from '@/_bff/modules/strava/helpers/strava-api.client'
import {
    stravaActivitySchema,
    stravaLapSchema,
} from '@/_bff/modules/strava/helpers/strava-schemas.helper'
import { selectConnection } from '@/_bff/modules/strava/repositories/strava-connections.repository'
import { getValidAccessToken } from '@/_bff/modules/strava/services/get-valid-access-token.service'
import { softDeleteStravaActivity } from '@/_bff/modules/training/services/soft-delete-strava-activity.service'
import { upsertActivityFromStrava } from '@/_bff/modules/training/services/upsert-activity-from-strava.service'

export type SyncContext = {
    supabase: ReturnType<typeof createDBAdminClient>
    userId: string
    accessToken: string
    timezone: string
    // The connected athlete: an activity of another athlete is refused.
    stravaAthleteId: number
}

// Positional 16-lap detection cannot see distances, so only these sport types are tagged: a run
// or a ride that happens to have 16 laps must not get station tags.
const STATION_SPORT_TYPES = new Set(['Workout', 'HighIntensityIntervalTraining', 'Crossfit'])

const lapsSchema = z.array(stravaLapSchema)

// Only field paths are kept from a validation failure, never the values.
const issuePaths = (issues: z.core.$ZodIssue[]) =>
    issues.map((issue) => issue.path.join('.')).join(', ')

const causeText = (cause: unknown) =>
    cause instanceof Error ? `${cause.name}: ${cause.message}` : 'unknown error'

// Services run in jobs and in the webhook route without a user session, so they use the
// service-role client.
export const createSyncClient = (error_hash: ErrorCode) =>
    Effect.tryPromise({
        try: async () => createDBAdminClient(),
        catch: (cause) => new CreateSbClientError({ cause, error_hash }),
    })

// The Strava payloads are parsed here (not in the API client) so that a bulk sync can skip one
// malformed activity instead of failing the batch. The activity is validated before its laps are
// requested, so a malformed activity costs one request. A 404 on the laps alone is an empty lap
// list: the activity was just confirmed to exist.
const fetchPayloads = Effect.fn('fetchPayloads')(function* (
    accessToken: string,
    stravaActivityId: number,
    stravaAthleteId: number
) {
    const rawActivity = yield* stravaApiGet(
        `/activities/${stravaActivityId}`,
        accessToken,
        z.unknown()
    )

    const activity = stravaActivitySchema.safeParse(rawActivity)
    if (!activity.success)
        return yield* new StravaPayloadError({
            cause: `Activity failed schema validation: ${issuePaths(activity.error.issues)}`,
            error_hash: ErrorCode.STRAVA_SYNC_ACTIVITY_PAYLOAD,
        })

    // No athlete field means no claim to check: accepted (fail open), the fetch used the owner's
    // own token.
    const owner = activity.data.athlete?.id
    if (owner !== undefined && owner !== stravaAthleteId)
        return yield* new StravaPayloadError({
            cause: 'Activity belongs to a different athlete than the connection',
            error_hash: ErrorCode.STRAVA_SYNC_ATHLETE_MISMATCH,
        })

    const rawLaps = yield* stravaApiGet(
        `/activities/${stravaActivityId}/laps`,
        accessToken,
        z.unknown()
    ).pipe(Effect.catchTag('StravaNotFoundError', () => Effect.succeed([])))

    const laps = lapsSchema.safeParse(rawLaps)
    if (!laps.success)
        return yield* new StravaPayloadError({
            cause: `Laps failed schema validation: ${issuePaths(laps.error.issues)}`,
            error_hash: ErrorCode.STRAVA_SYNC_LAPS_PAYLOAD,
        })

    return { activity: activity.data, laps: laps.data }
})

// Fetches, maps and stores one activity. A Strava 404 on the activity (deleted or private)
// soft-deletes the local activity: this is also what confirms a delete webhook event. A 401 is NOT handled here: a refresh race can produce a spurious one, so the
// connection is never removed on it. Rate limits and 5xx propagate so the job retries.
export const syncActivityWithContext = Effect.fn('syncActivityWithContext')(function* (
    context: SyncContext,
    stravaActivityId: number
) {
    const { supabase, userId, accessToken, timezone, stravaAthleteId } = context

    const payloads = yield* fetchPayloads(accessToken, stravaActivityId, stravaAthleteId).pipe(
        Effect.map((found) => ({ found: true as const, ...found })),
        Effect.catchTag('StravaNotFoundError', () => Effect.succeed({ found: false as const }))
    )

    if (!payloads.found) {
        yield* softDeleteStravaActivity(supabase, userId, stravaActivityId)
        return { deleted: true as const }
    }

    const { activity, laps } = payloads

    const baseRow = yield* Effect.try({
        try: () => mapStravaActivity(activity, timezone),
        catch: (cause) =>
            new StravaPayloadError({
                cause: causeText(cause),
                error_hash: ErrorCode.STRAVA_SYNC_MAPPING,
            }),
    })

    const stations = STATION_SPORT_TYPES.has(activity.sport_type)
        ? detectHyroxStations(laps)
        : laps.map(() => null)
    const hasStations = stations.some((station) => station !== null)

    const row = { ...baseRow, category: mapStravaCategory(activity.sport_type, hasStations) }
    const activityId = yield* upsertActivityFromStrava(
        supabase,
        userId,
        row,
        mapStravaLaps(laps, stations)
    )

    return { activityId }
})

// Client, token, connected athlete and profile timezone: what a sync run needs before any request.
export const loadSyncContext = Effect.fn('loadSyncContext')(function* (
    userId: string,
    clientErrorCode: ErrorCode
) {
    const supabase = yield* createSyncClient(clientErrorCode)
    const accessToken = yield* getValidAccessToken(userId)
    const connection = yield* selectConnection(supabase, userId)
    if (connection === null)
        return yield* new StravaNotConnectedError({
            cause: 'strava connection removed during sync setup',
            error_hash: ErrorCode.STRAVA_SYNC_NOT_CONNECTED,
        })
    const timezone = yield* getAthleteTimezoneWithClient(supabase, userId)

    return {
        supabase,
        userId,
        accessToken,
        timezone,
        stravaAthleteId: connection.strava_athlete_id,
    }
})

export const syncStravaActivity = Effect.fn('syncStravaActivity')(function* (
    userId: string,
    stravaActivityId: number
) {
    const context = yield* loadSyncContext(userId, ErrorCode.STRAVA_SYNC_SB_CLIENT)
    return yield* syncActivityWithContext(context, stravaActivityId)
})
