import type { User } from '@supabase/supabase-js'
import { z } from 'zod'
import { ACTIVITY_SETS_RETURNED } from '@/_bff/modules/coach/constants'
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

            if (!found) return { error: 'activity not found' }

            const truncatedSets = Math.max(0, found.strengthSets.length - ACTIVITY_SETS_RETURNED)
            const base = {
                activity: found.activity,
                laps: found.laps,
                strengthSets: found.strengthSets.slice(0, ACTIVITY_SETS_RETURNED).map((set) => ({
                    exercise: set.exercise,
                    exerciseIndex: set.exerciseIndex,
                    sourceExerciseId: set.sourceExerciseId,
                    setIndex: set.setIndex,
                    reps: set.reps,
                    loadKg: set.loadKg,
                    rir: set.rir,
                    rpe: set.rpe,
                })),
            }
            // `truncatedSets` is present only when sets were left out, so the model knows the list is partial.
            return truncatedSets > 0 ? { ...base, truncatedSets } : base
        }),
})
