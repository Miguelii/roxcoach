import 'server-only'

import { router } from '@/_bff/trpc/server'
import { CLEAR_ZEPP_ACTIVITIES_PROTECTED_CONTROLLER } from '@/_bff/modules/zepp/controllers/clear-activities.controller'
import { CONNECT_ZEPP_PROTECTED_CONTROLLER } from '@/_bff/modules/zepp/controllers/connect.controller'
import { DISCONNECT_ZEPP_PROTECTED_CONTROLLER } from '@/_bff/modules/zepp/controllers/disconnect.controller'
import { GET_ZEPP_ACTIVITY_COUNT_PROTECTED_CONTROLLER } from '@/_bff/modules/zepp/controllers/get-activity-count.controller'
import { GET_ZEPP_CONNECTION_STATUS_PROTECTED_CONTROLLER } from '@/_bff/modules/zepp/controllers/get-connection-status.controller'
import { SYNC_ZEPP_ACTIVITIES_PROTECTED_CONTROLLER } from '@/_bff/modules/zepp/controllers/sync-activities.controller'

export const ZEPP_ROUTER = router({
    getConnectionStatus: GET_ZEPP_CONNECTION_STATUS_PROTECTED_CONTROLLER,
    connect: CONNECT_ZEPP_PROTECTED_CONTROLLER,
    syncActivities: SYNC_ZEPP_ACTIVITIES_PROTECTED_CONTROLLER,
    clearActivities: CLEAR_ZEPP_ACTIVITIES_PROTECTED_CONTROLLER,
    getActivityCount: GET_ZEPP_ACTIVITY_COUNT_PROTECTED_CONTROLLER,
    disconnect: DISCONNECT_ZEPP_PROTECTED_CONTROLLER,
})
