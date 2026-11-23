import { task } from '@trigger.dev/sdk'
import { SYNC_TASK_MAX_DURATION_S } from '@/_bff/core/constants/sync.constants'
import type { SyncTaskPayload } from '@/_bff/core/helpers/sync-state.helper'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { LYFTA_SYNC_TASK_ID } from '@/_bff/modules/lyfta/constants'
import { finishLyftaSyncRun } from '@/_bff/modules/lyfta/services/finish-lyfta-sync.service'
import { syncLyftaWorkouts } from '@/_bff/modules/lyfta/services/sync-lyfta-workouts.service'
import { isPermanentLyftaSyncError } from '@/_bff/modules/lyfta/utils/sync-errors.utils'
import { recordFailedSyncTask, runSyncTask } from '@/_bff/trigger/run-sync-task'

export const syncLyftaWorkoutsTask = task({
    id: LYFTA_SYNC_TASK_ID,
    maxDuration: SYNC_TASK_MAX_DURATION_S,
    run: (payload: SyncTaskPayload) =>
        runSyncTask(payload, {
            sync: ({ userId, startedAt }) => syncLyftaWorkouts(userId, startedAt),
            finish: (validPayload, outcome) => finishLyftaSyncRun(validPayload, outcome),
            isPermanent: isPermanentLyftaSyncError,
            prefix: 'lyftaSync',
        }),
    onFailure: ({ payload }) =>
        recordFailedSyncTask(payload, finishLyftaSyncRun, ErrorCode.LYFTA_SYNC_FAILED, {
            prefix: 'lyftaSync',
        }),
})
