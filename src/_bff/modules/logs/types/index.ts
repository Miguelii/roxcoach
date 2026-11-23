import { z } from 'zod'
import { LOG_RANGES } from '@/_bff/core/constants/logs.constants'

export const getLogsInputSchema = z.object({
    range: z.enum(LOG_RANGES),
    search: z.string().trim().max(200).optional(),
})

export type GetLogsInput = z.infer<typeof getLogsInputSchema>
