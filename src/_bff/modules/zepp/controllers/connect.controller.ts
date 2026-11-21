import { z } from 'zod'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { zeppControllerErrorCode } from '@/_bff/modules/zepp/helpers/controller-errors'
import { connectZepp } from '@/_bff/modules/zepp/services/zepp-connection.service'

const INPUT = z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(512),
})

export const CONNECT_ZEPP_PROTECTED_CONTROLLER = protectedProcedure
    .input(INPUT)
    .mutation(({ ctx, input }) =>
        runEffect(connectZepp(ctx.user, input), 'connectZepp', zeppControllerErrorCode)
    )
