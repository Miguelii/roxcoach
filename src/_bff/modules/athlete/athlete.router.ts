import 'server-only'

import { router } from '@/_bff/trpc/server'
import { GET_TIMEZONE_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/get-timezone.controller'
import { GET_PROFILE_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/get-profile.controller'
import { UPDATE_PROFILE_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/update-profile.controller'

export const ATHLETE_ROUTER = router({
    getTimezone: GET_TIMEZONE_PROTECTED_CONTROLLER,
    getProfile: GET_PROFILE_PROTECTED_CONTROLLER,
    updateProfile: UPDATE_PROFILE_PROTECTED_CONTROLLER,
})
