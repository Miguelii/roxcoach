import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import {
    zeppControllerErrorCode,
    zeppControllerMessage,
} from '@/_bff/modules/zepp/helpers/controller-errors'
import { clearZeppActivities } from '@/_bff/modules/zepp/services/clear-zepp-activities.service'

export const CLEAR_ZEPP_ACTIVITIES_PROTECTED_CONTROLLER = protectedProcedure.mutation(({ ctx }) =>
    runEffect(
        clearZeppActivities(ctx.user),
        'clearZeppActivities',
        zeppControllerErrorCode,
        zeppControllerMessage
    )
)
