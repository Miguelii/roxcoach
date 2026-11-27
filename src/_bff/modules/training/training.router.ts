import 'server-only'

import { router } from '@/_bff/trpc/server'
import { GET_ACTIVITY_PROTECTED_CONTROLLER } from '@/_bff/modules/training/controllers/get-activity.controller'
import { GET_CALENDAR_PROTECTED_CONTROLLER } from '@/_bff/modules/training/controllers/get-calendar.controller'
import { GET_RUN_PROGRESS_PROTECTED_CONTROLLER } from '@/_bff/modules/training/controllers/get-run-progress.controller'
import { SET_RUN_TYPE_PROTECTED_CONTROLLER } from '@/_bff/modules/training/controllers/set-run-type.controller'
import { GET_STRENGTH_PROGRESS_PROTECTED_CONTROLLER } from '@/_bff/modules/training/controllers/get-strength-progress.controller'

export const TRAINING_ROUTER = router({
    getCalendar: GET_CALENDAR_PROTECTED_CONTROLLER,
    getActivity: GET_ACTIVITY_PROTECTED_CONTROLLER,
    getRunProgress: GET_RUN_PROGRESS_PROTECTED_CONTROLLER,
    getStrengthProgress: GET_STRENGTH_PROGRESS_PROTECTED_CONTROLLER,
    setRunType: SET_RUN_TYPE_PROTECTED_CONTROLLER,
})
