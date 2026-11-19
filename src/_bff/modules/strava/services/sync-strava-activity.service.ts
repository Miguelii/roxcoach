import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError, StravaPayloadError } from '@/_bff/lib/errors'
import { selectTimezone } from '@/_bff/modules/athlete/repositories/athlete-profiles.repository'
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
import { getValidAccessToken } from '@/_bff/modules/strava/services/get-valid-access-token.service'
import { softDeleteStravaActivity } from '@/_bff/modules/training/services/soft-delete-strava-activity.service'
import { upsertActivityFromStrava } from '@/_bff/modules/training/services/upsert-activity-from-strava.service'

export type SyncContext = {
    supabase: ReturnType<typeof createDBAdminClient>
    userId: string
    accessToken: string
    timezone: string
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
// malformed activity instead of failing the batch.
const fetchPayloads = Effect.fn('fetchPayloads')(function* (
    accessToken: string,
    stravaActivityId: number
) {
    const rawActivity = yield* stravaApiGet(
        `/activities/${stravaActivityId}`,
        accessToken,
        z.unknown()
    )
    const rawLaps = yield* stravaApiGet(
        `/activities/${stravaActivityId}/laps`,
        accessToken,
        z.unknown()
    )

    const activity = stravaActivitySchema.safeParse(rawActivity)
    if (!activity.success)
        return yield* new StravaPayloadError({
            cause: `Activity failed schema validation: ${issuePaths(activity.error.issues)}`,
            error_hash: ErrorCode.STRAVA_SYNC_ACTIVITY_PAYLOAD,
        })

    const laps = lapsSchema.safeParse(rawLaps)
    if (!laps.success)
        return yield* new StravaPayloadError({
            cause: `Laps failed schema validation: ${issuePaths(laps.error.issues)}`,
            error_hash: ErrorCode.STRAVA_SYNC_LAPS_PAYLOAD,
        })

    return { activity: activity.data, laps: laps.data }
})

// Fetches, maps and stores one activity. A Strava 404 (deleted or private) soft-deletes the local
// activity. A 401 is NOT handled here: a refresh race can produce a spurious one, so the
// connection is never removed on it. Rate limits and 5xx propagate so the job retries.
export const syncActivityWithContext = Effect.fn('syncActivityWithContext')(function* (
    context: SyncContext,
    stravaActivityId: number
) {
    const { supabase, userId, accessToken, timezone } = context

    const payloads = yield* fetchPayloads(accessToken, stravaActivityId).pipe(
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

export const syncStravaActivity = Effect.fn('syncStravaActivity')(function* (
    userId: string,
    stravaActivityId: number
) {
    const supabase = yield* createSyncClient(ErrorCode.STRAVA_SYNC_SB_CLIENT)
    const accessToken = yield* getValidAccessToken(userId)
    const timezone = yield* selectTimezone(supabase, userId)

    return yield* syncActivityWithContext(
        { supabase, userId, accessToken, timezone },
        stravaActivityId
    )
})
