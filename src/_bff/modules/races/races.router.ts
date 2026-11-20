import 'server-only'

import { router } from '@/_bff/trpc/server'
import { LIST_RACES_PROTECTED_CONTROLLER } from '@/_bff/modules/races/controllers/list-races.controller'
import { CREATE_RACE_PROTECTED_CONTROLLER } from '@/_bff/modules/races/controllers/create-race.controller'
import { UPDATE_RACE_PROTECTED_CONTROLLER } from '@/_bff/modules/races/controllers/update-race.controller'
import { COMPLETE_RACE_PROTECTED_CONTROLLER } from '@/_bff/modules/races/controllers/complete-race.controller'
import { CANCEL_RACE_PROTECTED_CONTROLLER } from '@/_bff/modules/races/controllers/cancel-race.controller'
import { DELETE_RACE_PROTECTED_CONTROLLER } from '@/_bff/modules/races/controllers/delete-race.controller'

export const RACES_ROUTER = router({
    list: LIST_RACES_PROTECTED_CONTROLLER,
    create: CREATE_RACE_PROTECTED_CONTROLLER,
    update: UPDATE_RACE_PROTECTED_CONTROLLER,
    complete: COMPLETE_RACE_PROTECTED_CONTROLLER,
    cancel: CANCEL_RACE_PROTECTED_CONTROLLER,
    delete: DELETE_RACE_PROTECTED_CONTROLLER,
})
