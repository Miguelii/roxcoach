import 'server-only'

import { router } from '@/_bff/trpc/server'
import { CONNECT_LYFTA_PROTECTED_CONTROLLER } from '@/_bff/modules/lyfta/controllers/connect.controller'
import { DISCONNECT_LYFTA_PROTECTED_CONTROLLER } from '@/_bff/modules/lyfta/controllers/disconnect.controller'
import { GET_LYFTA_CONNECTION_STATUS_PROTECTED_CONTROLLER } from '@/_bff/modules/lyfta/controllers/get-connection-status.controller'
import { SYNC_LYFTA_WORKOUTS_PROTECTED_CONTROLLER } from '@/_bff/modules/lyfta/controllers/sync-workouts.controller'

export const LYFTA_ROUTER = router({
    getConnectionStatus: GET_LYFTA_CONNECTION_STATUS_PROTECTED_CONTROLLER,
    connect: CONNECT_LYFTA_PROTECTED_CONTROLLER,
    syncWorkouts: SYNC_LYFTA_WORKOUTS_PROTECTED_CONTROLLER,
    disconnect: DISCONNECT_LYFTA_PROTECTED_CONTROLLER,
})
