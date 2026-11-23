import 'server-only'

import { router } from '@/_bff/trpc/server'
import { CLEAR_LYFTA_ACTIVITIES_PROTECTED_CONTROLLER } from '@/_bff/modules/lyfta/controllers/clear-activities.controller'
import { CONNECT_LYFTA_PROTECTED_CONTROLLER } from '@/_bff/modules/lyfta/controllers/connect.controller'
import { DISCONNECT_LYFTA_PROTECTED_CONTROLLER } from '@/_bff/modules/lyfta/controllers/disconnect.controller'
import { GET_LYFTA_ACTIVITY_COUNT_PROTECTED_CONTROLLER } from '@/_bff/modules/lyfta/controllers/get-activity-count.controller'
import { GET_LYFTA_CONNECTION_STATUS_PROTECTED_CONTROLLER } from '@/_bff/modules/lyfta/controllers/get-connection-status.controller'
import { SYNC_LYFTA_WORKOUTS_PROTECTED_CONTROLLER } from '@/_bff/modules/lyfta/controllers/sync-workouts.controller'

export const LYFTA_ROUTER = router({
    getConnectionStatus: GET_LYFTA_CONNECTION_STATUS_PROTECTED_CONTROLLER,
    connect: CONNECT_LYFTA_PROTECTED_CONTROLLER,
    syncWorkouts: SYNC_LYFTA_WORKOUTS_PROTECTED_CONTROLLER,
    clearActivities: CLEAR_LYFTA_ACTIVITIES_PROTECTED_CONTROLLER,
    getActivityCount: GET_LYFTA_ACTIVITY_COUNT_PROTECTED_CONTROLLER,
    disconnect: DISCONNECT_LYFTA_PROTECTED_CONTROLLER,
})
