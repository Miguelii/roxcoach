import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { lyftaControllerErrorCode } from '@/_bff/modules/lyfta/helpers/controller-errors'
import { disconnectLyfta } from '@/_bff/modules/lyfta/services/lyfta-connection.service'

export const DISCONNECT_LYFTA_PROTECTED_CONTROLLER = protectedProcedure.mutation(({ ctx }) =>
    runEffect(disconnectLyfta(ctx.user), 'disconnectLyfta', lyftaControllerErrorCode)
)
