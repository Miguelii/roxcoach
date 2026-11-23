import { task } from '@trigger.dev/sdk'
import { Effect } from 'effect'
import { SYNC_TASK_MAX_DURATION_S } from '@/_bff/core/constants/sync.constants'
import type { SyncTaskPayload } from '@/_bff/core/helpers/sync-state.helper'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ZEPP_SYNC_TASK_ID } from '@/_bff/modules/zepp/constants'
import { finishZeppSyncRun } from '@/_bff/modules/zepp/services/finish-zepp-sync.service'
import { syncZeppActivities } from '@/_bff/modules/zepp/services/sync-zepp-activities.service'
import { isPermanentZeppSyncError } from '@/_bff/modules/zepp/utils/sync-errors.utils'
import { parseSyncTaskPayload, runSyncTask } from '@/trigger/run-sync-task'

export const syncZeppActivitiesTask = task({
    id: ZEPP_SYNC_TASK_ID,
    maxDuration: SYNC_TASK_MAX_DURATION_S,
    run: (payload: SyncTaskPayload) =>
        runSyncTask(payload, {
            sync: (userId) => syncZeppActivities(userId),
            finish: (validPayload, outcome) => finishZeppSyncRun(validPayload, outcome),
            isPermanent: isPermanentZeppSyncError,
        }),
    onFailure: async ({ payload }) => {
        await Effect.runPromise(
            finishZeppSyncRun(parseSyncTaskPayload(payload), {
                status: 'failed',
                errorCode: ErrorCode.ZEPP_SYNC_FAILED,
            })
        )
    },
})
