import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import {
    lyftaControllerErrorCode,
    lyftaControllerMessage,
} from '@/_bff/modules/lyfta/helpers/controller-errors'
import { startLyftaSync } from '@/_bff/modules/lyfta/services/start-lyfta-sync.service'

export const SYNC_LYFTA_WORKOUTS_PROTECTED_CONTROLLER = protectedProcedure.mutation(({ ctx }) =>
    runEffect(
        startLyftaSync(ctx.user.id),
        'startLyftaSync',
        lyftaControllerErrorCode,
        lyftaControllerMessage
    )
)
