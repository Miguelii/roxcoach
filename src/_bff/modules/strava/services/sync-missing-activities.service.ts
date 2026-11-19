import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { Logger } from '@/_bff/lib/server-logger'
import { StravaPayloadError } from '@/_bff/lib/errors'
import { selectTimezone } from '@/_bff/modules/athlete/repositories/athlete-profiles.repository'
import { ACTIVITIES_PER_PAGE, SYNC_ITEM_DELAY_MS } from '@/_bff/modules/strava/constants'
import { stravaApiGet } from '@/_bff/modules/strava/helpers/strava-api.client'
import { touchLastSyncedAt } from '@/_bff/modules/strava/repositories/strava-connections.repository'
import { getValidAccessToken } from '@/_bff/modules/strava/services/get-valid-access-token.service'
import {
    createSyncClient,
    syncActivityWithContext,
} from '@/_bff/modules/strava/services/sync-strava-activity.service'

type Options = { afterEpochS: number | null }

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

// Lists the athlete's activities page by page and syncs each one (2 Strava requests each). A rate
// limit or 5xx stops the run and propagates: what was already synced is kept, and
// `last_synced_at` is only touched when the whole run succeeds. A malformed activity is logged
// and skipped, it does not abort the batch and does not count as synced.
export const syncMissingActivities = Effect.fn('syncMissingActivities')(function* (
    userId: string,
    options: Options
) {
    const supabase = yield* createSyncClient(ErrorCode.STRAVA_SYNC_MISSING_SB_CLIENT)
    const accessToken = yield* getValidAccessToken(userId)
    const timezone = yield* selectTimezone(supabase, userId)
    const context = { supabase, userId, accessToken, timezone }

    let synced = 0
    let attempted = 0
    let page = 1

    while (true) {
        const base = { per_page: ACTIVITIES_PER_PAGE, page }
        const query = options.afterEpochS === null ? base : { ...base, after: options.afterEpochS }

        const items = yield* stravaApiGet('/athlete/activities', accessToken, pageSchema, query)
        if (items.length === 0) break

        for (const item of items) {
            const parsed = listItemSchema.safeParse(item)
            if (!parsed.success) {
                logSkipped(
                    new StravaPayloadError({
                        cause: 'List item has no numeric id',
                        error_hash: ErrorCode.STRAVA_SYNC_LIST_PAYLOAD,
                    }),
                    null
                )
                continue
            }

            if (attempted > 0) yield* Effect.sleep(SYNC_ITEM_DELAY_MS)
            attempted += 1

            const outcome = yield* syncActivityWithContext(context, parsed.data.id).pipe(
                Effect.catchTag('StravaPayloadError', (error) =>
                    Effect.sync(() => {
                        logSkipped(error, parsed.data.id)
                        return { skipped: true as const }
                    })
                )
            )
            if ('activityId' in outcome) synced += 1
        }

        page += 1
    }

    yield* touchLastSyncedAt(supabase, userId, new Date().toISOString())

    return { synced }
})
