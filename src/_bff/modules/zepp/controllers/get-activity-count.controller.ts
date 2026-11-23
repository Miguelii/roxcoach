import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { zeppControllerErrorCode } from '@/_bff/modules/zepp/helpers/controller-errors'
import { getZeppActivityCount } from '@/_bff/modules/zepp/services/clear-zepp-activities.service'

export const GET_ZEPP_ACTIVITY_COUNT_PROTECTED_CONTROLLER = protectedProcedure.query(({ ctx }) =>
    runEffect(getZeppActivityCount(ctx.user), 'getZeppActivityCount', zeppControllerErrorCode)
)
