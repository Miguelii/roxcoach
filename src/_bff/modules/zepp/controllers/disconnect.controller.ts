import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { zeppControllerErrorCode } from '@/_bff/modules/zepp/helpers/controller-errors'
import { disconnectZepp } from '@/_bff/modules/zepp/services/zepp-connection.service'

export const DISCONNECT_ZEPP_PROTECTED_CONTROLLER = protectedProcedure.mutation(({ ctx }) =>
    runEffect(disconnectZepp(ctx.user), 'disconnectZepp', zeppControllerErrorCode)
)
