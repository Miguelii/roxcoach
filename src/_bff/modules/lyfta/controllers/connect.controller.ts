import { z } from 'zod'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { lyftaControllerErrorCode } from '@/_bff/modules/lyfta/helpers/controller-errors'
import { connectLyfta } from '@/_bff/modules/lyfta/services/lyfta-connection.service'

const INPUT = z.object({
    apiKey: z
        .string()
        .min(1)
        .max(512)
        .refine((value) => value.trim().length > 0),
})

export const CONNECT_LYFTA_PROTECTED_CONTROLLER = protectedProcedure
    .input(INPUT)
    .mutation(({ ctx, input }) =>
        runEffect(connectLyfta(ctx.user, input.apiKey), 'connectLyfta', lyftaControllerErrorCode)
    )
