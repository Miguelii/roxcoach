import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import {
    lyftaControllerErrorCode,
    lyftaControllerMessage,
} from '@/_bff/modules/lyfta/helpers/controller-errors'
import { clearLyftaActivities } from '@/_bff/modules/lyfta/services/clear-lyfta-activities.service'

export const CLEAR_LYFTA_ACTIVITIES_PROTECTED_CONTROLLER = protectedProcedure.mutation(({ ctx }) =>
    runEffect(
        clearLyftaActivities(ctx.user),
        'clearLyftaActivities',
        lyftaControllerErrorCode,
        lyftaControllerMessage
    )
)
