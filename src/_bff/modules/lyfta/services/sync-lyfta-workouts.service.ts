import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    LyftaCheckpointError,
    LyftaConnectionNotFoundError,
    LyftaResponseError,
} from '@/_bff/lib/errors'
import {
    selectLyftaConnection,
    updateLyftaLastSyncedAt,
} from '@/_bff/modules/lyfta/repositories/lyfta-connections.repository'
import type { LyftaWorkoutRange } from '@/_bff/modules/lyfta/types'
import { fetchLyftaWorkoutPage } from '@/_bff/modules/lyfta/services/lyfta-api.service'
import {
    DEFAULT_LYFTA_CONNECTION_DEPENDENCIES,
    decryptConnectionKey,
    type LyftaConnectionDependencies,
} from '@/_bff/modules/lyfta/services/lyfta-connection.service'
import { importLyftaWorkout } from '@/_bff/modules/training/services/import-lyfta-workout.service'
import { getLyftaIncrementalRange } from '@/_bff/modules/lyfta/utils/workouts.utils'

type SyncDependencies = LyftaConnectionDependencies & {
    importWorkout: typeof importLyftaWorkout
    now: () => Date
}

const DEFAULT_DEPENDENCIES: SyncDependencies = {
    ...DEFAULT_LYFTA_CONNECTION_DEPENDENCIES,
    importWorkout: importLyftaWorkout,
    now: () => new Date(),
}

const buildRange = (lastSyncedAt: string | null, now: Date) => {
    if (lastSyncedAt === null) return Effect.succeed(undefined)
    return Effect.try({
        try: () => getLyftaIncrementalRange(lastSyncedAt, now),
        catch: () =>
            new LyftaCheckpointError({
                cause: 'Could not calculate the incremental Lyfta date range',
                error_hash: ErrorCode.LYFTA_CHECKPOINT,
            }),
    })
}

export const syncLyftaWorkouts = Effect.fn('syncLyftaWorkouts')(function* (
    user: User,
    dependencies: SyncDependencies = DEFAULT_DEPENDENCIES
) {
    const encryptionKey = dependencies.encryptionKey
    const adminClient = yield* Effect.try({
        try: dependencies.createAdminClient,
        catch: () =>
            new LyftaCheckpointError({
                cause: 'Could not create the Lyfta connection database client',
                error_hash: ErrorCode.LYFTA_CLIENT,
            }),
    })
    const connection = yield* selectLyftaConnection(adminClient, user.id)
    if (connection === null) {
        return yield* new LyftaConnectionNotFoundError({
            cause: 'No Lyfta connection exists for this user',
            error_hash: ErrorCode.LYFTA_NO_CONNECTION,
        })
    }

    const apiKey = yield* decryptConnectionKey(connection.encryptedApiKey, encryptionKey)
    const startedAt = dependencies.now()
    const range: LyftaWorkoutRange | undefined = yield* buildRange(
        connection.lastSyncedAt,
        startedAt
    )

    let pageNumber = 1
    let totalPages: number | null = null
    let created = 0
    let updated = 0
    const seenSourceIds = new Set<string>()

    while (totalPages === null || pageNumber <= totalPages) {
        const page = yield* fetchLyftaWorkoutPage({
            apiKey,
            page: pageNumber,
            range,
            fetcher: dependencies.fetcher,
        })

        if (totalPages === null) {
            totalPages = page.totalPages
        } else if (page.totalPages !== totalPages) {
            return yield* new LyftaResponseError({
                cause: 'Lyfta pagination changed during sync',
                error_hash: ErrorCode.LYFTA_API_RESPONSE,
            })
        }

        for (const workout of page.workouts) {
            if (seenSourceIds.has(workout.sourceId)) {
                return yield* new LyftaResponseError({
                    cause: 'Lyfta returned a duplicate workout ID during pagination',
                    error_hash: ErrorCode.LYFTA_API_RESPONSE,
                })
            }
            seenSourceIds.add(workout.sourceId)

            const result = yield* dependencies.importWorkout(user, workout)
            if (result.created) created += 1
            else updated += 1
        }

        pageNumber += 1
    }

    const lastSyncedAt = yield* Effect.try({
        try: () => dependencies.now().toISOString(),
        catch: () =>
            new LyftaCheckpointError({
                cause: 'Could not create the Lyfta sync timestamp',
                error_hash: ErrorCode.LYFTA_CHECKPOINT,
            }),
    })

    yield* updateLyftaLastSyncedAt(adminClient, user.id, lastSyncedAt)

    return { created, updated, lastSyncedAt }
})
