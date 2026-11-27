import 'server-only'

import { Effect } from 'effect'
import type { RunType, RunTypeRules } from '@/_bff/core/constants/weekly-goals.constants'
import { classifyRun } from '@/_bff/modules/training/helpers/classify-run.helper'
import {
    selectRunsForReclassify,
    updateRunTypes,
} from '@/_bff/modules/training/repositories/activities.repository'
import type { TrainingClient } from '@/_bff/modules/training/types'

// Reapplies the rules to every run whose type was not set by hand. Only the runs whose type changes
// are written, grouped into one update per new type. Returns how many runs changed.
export const reclassifyRuns = Effect.fn('reclassifyRuns')(function* (
    supabase: TrainingClient,
    userId: string,
    rules: RunTypeRules
) {
    const runs = yield* selectRunsForReclassify(supabase, userId)

    const idsByType = new Map<RunType | null, string[]>()
    for (const run of runs) {
        const next = classifyRun(run, rules)
        if (next === run.runType) continue
        idsByType.set(next, [...(idsByType.get(next) ?? []), run.id])
    }

    yield* Effect.forEach(
        [...idsByType],
        ([runType, ids]) => updateRunTypes(supabase, userId, ids, runType),
        { discard: true }
    )

    return [...idsByType.values()].reduce((total, ids) => total + ids.length, 0)
})
