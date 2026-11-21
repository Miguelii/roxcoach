import 'server-only'

import { Effect } from 'effect'
import { parseActivityFile } from '@/_bff/modules/training/helpers/parse-activity-file.helper'
import {
    selectBackfillTargets,
    updateHrHistogram,
} from '@/_bff/modules/training/repositories/activities.repository'
import { getActivityFile } from '@/_bff/modules/training/repositories/activity-files-storage.repository'
import type { StorageReadClient, TrainingClient } from '@/_bff/modules/training/types'

type BackfillClient = TrainingClient & StorageReadClient

type Target = { activityId: string; storagePath: string }

// Only the activity id and the error code: never a path, a file name or file content.
type BackfillFailure = { activityId: string; errorCode: string }

type BackfillResult = { updated: number; failed: number; failures: BackfillFailure[] }

const processTarget = (client: BackfillClient, userId: string, target: Target) =>
    Effect.gen(function* () {
        const bytes = yield* getActivityFile(client, target.storagePath)
        const parsed = yield* parseActivityFile(bytes)
        yield* updateHrHistogram(client, userId, target.activityId, parsed.hrHistogram)
    })

// Recomputes the HR histogram of every activity of the user that has none, from the stored file.
// Sequential and resumable: only rows still null are selected, so a rerun picks up the rest. A
// file that fails is counted and skipped, it never stops the run.
export const backfillHrHistograms = Effect.fn('backfillHrHistograms')(function* (
    client: BackfillClient,
    userId: string
) {
    const targets = yield* selectBackfillTargets(client, userId)
    const failures: BackfillFailure[] = []
    let updated = 0

    for (const target of targets) {
        const failure = yield* processTarget(client, userId, target).pipe(
            Effect.as(null),
            Effect.catch((error) =>
                Effect.succeed({ activityId: target.activityId, errorCode: error.error_hash })
            )
        )
        if (failure === null) updated += 1
        else failures.push(failure)
    }

    const result: BackfillResult = { updated, failed: failures.length, failures }
    return result
})
