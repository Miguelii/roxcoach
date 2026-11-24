import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { lyftaControllerErrorCode } from '@/_bff/modules/lyfta/helpers/controller-errors'
import { getLyftaActivityCount } from '@/_bff/modules/lyfta/services/clear-lyfta-activities.service'

export const GET_LYFTA_ACTIVITY_COUNT_PROTECTED_CONTROLLER = protectedProcedure.query(({ ctx }) =>
    runEffect(getLyftaActivityCount(ctx.user), 'getLyftaActivityCount', lyftaControllerErrorCode)
)
