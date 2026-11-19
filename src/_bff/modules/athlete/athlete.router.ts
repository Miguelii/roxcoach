import 'server-only'

import { router } from '@/_bff/trpc/server'
import { GET_TIMEZONE_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/get-timezone.controller'

export const ATHLETE_ROUTER = router({
    getTimezone: GET_TIMEZONE_PROTECTED_CONTROLLER,
})
