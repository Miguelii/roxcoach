import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { Logger } from '@/_bff/lib/server-logger'
import { ProfileQueryError, StravaPayloadError } from '@/_bff/lib/errors'
import { ACTIVITIES_PER_PAGE, SYNC_ITEM_DELAY_MS } from '@/_bff/modules/strava/constants'
import { stravaApiGet } from '@/_bff/modules/strava/helpers/strava-api.client'
import { touchLastSyncedAt } from '@/_bff/modules/strava/repositories/strava-connections.repository'
import { getExistingStravaIds } from '@/_bff/modules/training/services/get-existing-strava-ids.service'
import {
    loadSyncContext,
    syncActivityWithContext,
} from '@/_bff/modules/strava/services/sync-strava-activity.service'

type Options = {
    afterEpochS: number | null
    // False for a pass that is not the last of its run: `last_synced_at` is then left alone.
    markSynced?: boolean
}

const listItemSchema = z.object({ id: z.number() })

// Items are parsed one by one, so a malformed entry is skipped instead of failing the page.
const pageSchema = z.array(z.unknown())

const logSkipped = (error: StravaPayloadError, activityId: number | null) =>
    Logger({
        level: 'warn',
        prefix: 'syncMissingActivities',
        message: 'Skipped a Strava activity that could not be synced',
        metadata: { errorName: error._tag, errorHash: error.error_hash, activityId },
    })

// Lists the athlete's activities page by page and syncs each one that is not stored yet (2 Strava
// requests each). A rate
// limit or 5xx stops the run and propagates: what was already synced is kept, and
// `last_synced_at` is only touched, with the start time of the run, when the whole run succeeds.
// A malformed activity is logged
// and skipped, it does not abort the batch and does not count as synced.
export const syncMissingActivities = Effect.fn('syncMissingActivities')(function* (
    userId: string,
    options: Options
) {
    // Captured before the first request: an activity uploaded during the run is picked up by the
    // next one instead of falling between two runs.
    const startedAt = new Date().toISOString()

    const context = yield* loadSyncContext(userId, ErrorCode.STRAVA_SYNC_MISSING_SB_CLIENT)
    const { supabase, accessToken } = context

    // An invalid profile timezone would make every activity fail to map: fail the run up front
    // instead of skipping everything and advancing `last_synced_at`.
    yield* Effect.try({
        try: () => new Intl.DateTimeFormat('en-CA', { timeZone: context.timezone }),
        catch: () =>
            new ProfileQueryError({
                cause: 'Profile timezone is not a valid IANA timezone',
                error_hash: ErrorCode.ATHLETE_PROFILE_TIMEZONE_INVALID,
            }),
    })

    let synced = 0
    let attempted = 0
    let page = 1

    while (true) {
        const base = { per_page: ACTIVITIES_PER_PAGE, page }
        const query = options.afterEpochS === null ? base : { ...base, after: options.afterEpochS }

        const items = yield* stravaApiGet('/athlete/activities', accessToken, pageSchema, query)
        if (items.length === 0) break

        const entries = items.map((item) => listItemSchema.safeParse(item))
        const listedIds = entries.flatMap((entry) => (entry.success ? [entry.data.id] : []))

        // Already stored activities are skipped (the list page costs one request, a sync two), so
        // a run retried after a rate limit continues where the previous one stopped.
        const stored = yield* getExistingStravaIds(supabase, userId, listedIds)

        for (const entry of entries) {
            if (!entry.success) {
                yield* Effect.sync(() =>
                    logSkipped(
                        new StravaPayloadError({
                            cause: 'List item has no numeric id',
                            error_hash: ErrorCode.STRAVA_SYNC_LIST_PAYLOAD,
                        }),
                        null
                    )
                )
                continue
            }

            const activityId = entry.data.id
            if (stored.has(activityId)) continue

            if (attempted > 0) yield* Effect.sleep(SYNC_ITEM_DELAY_MS)
            attempted += 1

            const outcome = yield* syncActivityWithContext(context, activityId).pipe(
                Effect.catchTag('StravaPayloadError', (error) =>
                    Effect.sync(() => {
                        logSkipped(error, activityId)
                        return { skipped: true as const }
                    })
                )
            )
            if ('activityId' in outcome) synced += 1
        }

        page += 1
    }

    if (options.markSynced !== false) yield* touchLastSyncedAt(supabase, userId, startedAt)

    return { synced }
})
