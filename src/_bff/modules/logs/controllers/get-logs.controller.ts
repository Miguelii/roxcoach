import { Match } from 'effect'
import { adminProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { getLogs } from '@/_bff/modules/logs/services/get-logs.service'
import { getLogsInputSchema } from '@/_bff/modules/logs/types'

export const GET_LOGS_PROTECTED_CONTROLLER = adminProcedure
    .input(getLogsInputSchema)
    .query(({ input }) =>
        runEffect(getLogs(input), 'getLogs', (error) =>
            Match.value(error).pipe(
                Match.tag('LogsClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('LogsQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.exhaustive
            )
        )
    )
