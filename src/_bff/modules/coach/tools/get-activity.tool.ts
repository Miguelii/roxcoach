import type { User } from '@supabase/supabase-js'
import { z } from 'zod'
import { runTool } from '@/_bff/modules/coach/tools/run-tool'
import type { CoachTool, CoachToolDeps } from '@/_bff/modules/coach/types'

const inputSchema = z.object({ id: z.uuid() })

export const makeGetActivityTool = (user: User, deps: CoachToolDeps): CoachTool => ({
    name: 'getActivity',
    description:
        'Returns one activity by id with its laps, strength sets, and Hyrox stations when known.',
    inputSchema,
    execute: (input) =>
        runTool(inputSchema, input, async ({ id }) => {
            const found = await deps.getActivity(user, id)

            return found
                ? {
                      activity: found.activity,
                      laps: found.laps,
                      strengthSets: found.strengthSets,
                  }
                : { error: 'activity not found' }
        }),
})
