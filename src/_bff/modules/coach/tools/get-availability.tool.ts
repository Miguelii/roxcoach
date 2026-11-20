import type { User } from '@supabase/supabase-js'
import { z } from 'zod'
import { runTool } from '@/_bff/modules/coach/tools/run-tool'
import type { CoachTool, CoachToolDeps } from '@/_bff/modules/coach/types'

const inputSchema = z.object({})

export const makeGetAvailabilityTool = (user: User, deps: CoachToolDeps): CoachTool => ({
    name: 'getAvailability',
    description: 'Returns the typical weekly availability slots (weekday 1 is Monday).',
    inputSchema,
    execute: (input) =>
        runTool(inputSchema, input, async () => ({ slots: await deps.getAvailability(user) })),
})
