import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { zeppControllerErrorCode } from '@/_bff/modules/zepp/helpers/controller-errors'
import { syncZeppActivities } from '@/_bff/modules/zepp/services/sync-zepp-activities.service'

export const SYNC_ZEPP_ACTIVITIES_PROTECTED_CONTROLLER = protectedProcedure.mutation(({ ctx }) =>
    runEffect(syncZeppActivities(ctx.user.id), 'syncZeppActivities', zeppControllerErrorCode)
)
