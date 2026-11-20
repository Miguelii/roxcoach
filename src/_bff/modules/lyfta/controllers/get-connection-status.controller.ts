import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { lyftaControllerErrorCode } from '@/_bff/modules/lyfta/controllers/controller-errors'
import { getLyftaConnectionStatus } from '@/_bff/modules/lyfta/services/lyfta-connection.service'

export const GET_LYFTA_CONNECTION_STATUS_PROTECTED_CONTROLLER = protectedProcedure.query(
    ({ ctx }) =>
        runEffect(
            getLyftaConnectionStatus(ctx.user),
            'getLyftaConnectionStatus',
            lyftaControllerErrorCode
        )
)
