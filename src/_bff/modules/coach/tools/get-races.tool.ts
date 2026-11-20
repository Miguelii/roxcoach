import type { User } from '@supabase/supabase-js'
import { z } from 'zod'
import { runTool } from '@/_bff/modules/coach/tools/run-tool'
import type { CoachTool, CoachToolDeps } from '@/_bff/modules/coach/types'

const inputSchema = z.object({ status: z.enum(['upcoming', 'completed', 'cancelled']).optional() })

export const makeGetRacesTool = (user: User, deps: CoachToolDeps): CoachTool => ({
    name: 'getRaces',
    description:
        'Lists the athlete races with goals (target time, priority) and results. Optional status filter.',
    inputSchema,
    execute: (input) =>
        runTool(inputSchema, input, async ({ status }) => ({
            races: await deps.listRaces(user, status ? { status: [status] } : {}),
        })),
})
