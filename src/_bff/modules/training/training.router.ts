import 'server-only'

import { router } from '@/_bff/trpc/server'
import { GET_ACTIVITY_PROTECTED_CONTROLLER } from '@/_bff/modules/training/controllers/get-activity.controller'
import { GET_CALENDAR_PROTECTED_CONTROLLER } from '@/_bff/modules/training/controllers/get-calendar.controller'

export const TRAINING_ROUTER = router({
    getCalendar: GET_CALENDAR_PROTECTED_CONTROLLER,
    getActivity: GET_ACTIVITY_PROTECTED_CONTROLLER,
})
