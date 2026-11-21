import 'server-only'

import { router } from '@/_bff/trpc/server'
import { GET_TIMEZONE_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/get-timezone.controller'
import { GET_PROFILE_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/get-profile.controller'
import { SET_DASHBOARD_MODE_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/set-dashboard-mode.controller'
import { UPDATE_PROFILE_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/update-profile.controller'
import { GET_AVAILABILITY_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/get-availability.controller'
import { SAVE_AVAILABILITY_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/save-availability.controller'

export const ATHLETE_ROUTER = router({
    getTimezone: GET_TIMEZONE_PROTECTED_CONTROLLER,
    getProfile: GET_PROFILE_PROTECTED_CONTROLLER,
    updateProfile: UPDATE_PROFILE_PROTECTED_CONTROLLER,
    setDashboardMode: SET_DASHBOARD_MODE_PROTECTED_CONTROLLER,
    getAvailability: GET_AVAILABILITY_PROTECTED_CONTROLLER,
    saveAvailability: SAVE_AVAILABILITY_PROTECTED_CONTROLLER,
})
