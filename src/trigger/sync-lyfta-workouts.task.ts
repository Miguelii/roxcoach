import { task } from '@trigger.dev/sdk'
import { Effect } from 'effect'
import { SYNC_TASK_MAX_DURATION_S } from '@/_bff/core/constants/sync.constants'
import type { SyncTaskPayload } from '@/_bff/core/helpers/sync-state.helper'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { LYFTA_SYNC_TASK_ID } from '@/_bff/modules/lyfta/constants'
import { finishLyftaSyncRun } from '@/_bff/modules/lyfta/services/finish-lyfta-sync.service'
import { syncLyftaWorkouts } from '@/_bff/modules/lyfta/services/sync-lyfta-workouts.service'
import { isPermanentLyftaSyncError } from '@/_bff/modules/lyfta/utils/sync-errors.utils'
import { parseSyncTaskPayload, runSyncTask } from '@/trigger/run-sync-task'

export const syncLyftaWorkoutsTask = task({
    id: LYFTA_SYNC_TASK_ID,
    maxDuration: SYNC_TASK_MAX_DURATION_S,
    run: (payload: SyncTaskPayload) =>
        runSyncTask(payload, {
            sync: (userId) => syncLyftaWorkouts(userId),
            finish: (validPayload, outcome) => finishLyftaSyncRun(validPayload, outcome),
            isPermanent: isPermanentLyftaSyncError,
        }),
    onFailure: async ({ payload }) => {
        await Effect.runPromise(
            finishLyftaSyncRun(parseSyncTaskPayload(payload), {
                status: 'failed',
                errorCode: ErrorCode.LYFTA_SYNC_FAILED,
            })
        )
    },
})
