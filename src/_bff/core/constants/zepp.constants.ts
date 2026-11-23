import { z } from 'zod'

export const zeppSyncResultSchema = z.object({
    imported: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
})

export type ZeppSyncResult = z.infer<typeof zeppSyncResultSchema>

export const ZEPP_SYNC_IN_PROGRESS_MESSAGE = 'A Zepp sync is already running'
