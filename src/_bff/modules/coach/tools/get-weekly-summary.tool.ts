import type { User } from '@supabase/supabase-js'
import { z } from 'zod'
import { computeTotals } from '@/_bff/core/utils/week-stats.utils'
import { addDays, isoWeekday } from '@/_bff/core/utils/week-dates.utils'
import { plainDate } from '@/_bff/modules/coach/tools/plain-date'
import { runTool } from '@/_bff/modules/coach/tools/run-tool'
import type { CoachTool, CoachToolDeps } from '@/_bff/modules/coach/types'

const inputSchema = z.object({
    weekStart: plainDate.refine((value) => isoWeekday(value) === 1, {
        message: 'must be a Monday',
    }),
})

const round1 = (value: number) => Math.round(value * 10) / 10

export const makeGetWeeklySummaryTool = (user: User, deps: CoachToolDeps): CoachTool => ({
    name: 'getWeeklySummary',
    description:
        'Totals for one ISO week (Monday to Sunday): done minutes, sessions and run km. weekStart must be a Monday (YYYY-MM-DD).',
    inputSchema,
    execute: (input) =>
        runTool(inputSchema, input, async ({ weekStart }) => {
            const weekEnd = addDays(weekStart, 6)
            const items = await deps.getCalendar(user, { from: weekStart, to: weekEnd })
            const totals = computeTotals(items, weekStart, weekEnd)

            return {
                weekStart,
                weekEnd,
                doneMinutes: round1(totals.doneMinutes),
                doneSessions: totals.doneSessions,
                runKm: round1(totals.runKm),
            }
        }),
})
