import 'server-only'

import { router } from '@/_bff/trpc/server'
import { GET_TIMEZONE_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/get-timezone.controller'
import { GET_PROFILE_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/get-profile.controller'
import { SET_DASHBOARD_MODE_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/set-dashboard-mode.controller'
import { UPDATE_PROFILE_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/update-profile.controller'
import { GET_AVAILABILITY_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/get-availability.controller'
import { SAVE_AVAILABILITY_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/save-availability.controller'
import { GET_WEEKLY_GOALS_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/get-weekly-goals.controller'
import { SAVE_WEEKLY_GOALS_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/save-weekly-goals.controller'
import { DELETE_ACCOUNT_PROTECTED_CONTROLLER } from '@/_bff/modules/athlete/controllers/delete-account.controller'

export const ATHLETE_ROUTER = router({
    getTimezone: GET_TIMEZONE_PROTECTED_CONTROLLER,
    getProfile: GET_PROFILE_PROTECTED_CONTROLLER,
    updateProfile: UPDATE_PROFILE_PROTECTED_CONTROLLER,
    setDashboardMode: SET_DASHBOARD_MODE_PROTECTED_CONTROLLER,
    getAvailability: GET_AVAILABILITY_PROTECTED_CONTROLLER,
    saveAvailability: SAVE_AVAILABILITY_PROTECTED_CONTROLLER,
    getWeeklyGoals: GET_WEEKLY_GOALS_PROTECTED_CONTROLLER,
    saveWeeklyGoals: SAVE_WEEKLY_GOALS_PROTECTED_CONTROLLER,
    deleteAccount: DELETE_ACCOUNT_PROTECTED_CONTROLLER,
})
