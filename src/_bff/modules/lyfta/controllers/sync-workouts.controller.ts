import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { lyftaControllerErrorCode } from '@/_bff/modules/lyfta/controllers/controller-errors'
import { syncLyftaWorkouts } from '@/_bff/modules/lyfta/services/sync-lyfta-workouts.service'

export const SYNC_LYFTA_WORKOUTS_PROTECTED_CONTROLLER = protectedProcedure.mutation(({ ctx }) =>
    runEffect(syncLyftaWorkouts(ctx.user), 'syncLyftaWorkouts', lyftaControllerErrorCode)
)
