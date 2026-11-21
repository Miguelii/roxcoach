import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { zeppControllerErrorCode } from '@/_bff/modules/zepp/helpers/controller-errors'
import { getZeppConnectionStatus } from '@/_bff/modules/zepp/services/zepp-connection.service'

export const GET_ZEPP_CONNECTION_STATUS_PROTECTED_CONTROLLER = protectedProcedure.query(({ ctx }) =>
    runEffect(getZeppConnectionStatus(ctx.user), 'getZeppConnectionStatus', zeppControllerErrorCode)
)
