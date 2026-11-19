import 'server-only'

import { router } from '@/_bff/trpc/server'
import { DISCONNECT_PROTECTED_CONTROLLER } from '@/_bff/modules/strava/controllers/disconnect.controller'
import { GET_CONNECT_URL_PROTECTED_CONTROLLER } from '@/_bff/modules/strava/controllers/get-connect-url.controller'
import { GET_STATUS_PROTECTED_CONTROLLER } from '@/_bff/modules/strava/controllers/get-status.controller'
import { SYNC_NOW_PROTECTED_CONTROLLER } from '@/_bff/modules/strava/controllers/sync-now.controller'

export const STRAVA_ROUTER = router({
    getConnectUrl: GET_CONNECT_URL_PROTECTED_CONTROLLER,
    getStatus: GET_STATUS_PROTECTED_CONTROLLER,
    disconnect: DISCONNECT_PROTECTED_CONTROLLER,
    syncNow: SYNC_NOW_PROTECTED_CONTROLLER,
})
