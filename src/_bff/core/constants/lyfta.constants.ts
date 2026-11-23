import { z } from 'zod'

export const lyftaSyncResultSchema = z.object({
    created: z.number().int(),
    updated: z.number().int(),
    hasMore: z.boolean(),
})

export type LyftaSyncResult = z.infer<typeof lyftaSyncResultSchema>

// The fixed client message of a refused overlapping Lyfta sync (the error code is not shown).
export const LYFTA_SYNC_IN_PROGRESS_MESSAGE = 'A Lyfta sync is already running'
