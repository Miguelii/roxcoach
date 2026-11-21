import 'server-only'

import { router } from '@/_bff/trpc/server'
import { CONNECT_ZEPP_PROTECTED_CONTROLLER } from '@/_bff/modules/zepp/controllers/connect.controller'
import { DISCONNECT_ZEPP_PROTECTED_CONTROLLER } from '@/_bff/modules/zepp/controllers/disconnect.controller'
import { GET_ZEPP_CONNECTION_STATUS_PROTECTED_CONTROLLER } from '@/_bff/modules/zepp/controllers/get-connection-status.controller'
import { SYNC_ZEPP_ACTIVITIES_PROTECTED_CONTROLLER } from '@/_bff/modules/zepp/controllers/sync-activities.controller'

export const ZEPP_ROUTER = router({
    getConnectionStatus: GET_ZEPP_CONNECTION_STATUS_PROTECTED_CONTROLLER,
    connect: CONNECT_ZEPP_PROTECTED_CONTROLLER,
    syncActivities: SYNC_ZEPP_ACTIVITIES_PROTECTED_CONTROLLER,
    disconnect: DISCONNECT_ZEPP_PROTECTED_CONTROLLER,
})
