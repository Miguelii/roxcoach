import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import {
    zeppControllerErrorCode,
    zeppControllerMessage,
} from '@/_bff/modules/zepp/helpers/controller-errors'
import { startZeppSync } from '@/_bff/modules/zepp/services/start-zepp-sync.service'

export const SYNC_ZEPP_ACTIVITIES_PROTECTED_CONTROLLER = protectedProcedure.mutation(({ ctx }) =>
    runEffect(
        startZeppSync(ctx.user.id),
        'startZeppSync',
        zeppControllerErrorCode,
        zeppControllerMessage
    )
)
