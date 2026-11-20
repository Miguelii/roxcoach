import type { User } from '@supabase/supabase-js'
import { z } from 'zod'
import { parseIsoDate, DAY_MS } from '@/_bff/core/utils/week-dates.utils'
import { plainDate } from '@/_bff/modules/coach/tools/plain-date'
import { runTool } from '@/_bff/modules/coach/tools/run-tool'
import type { CoachTool, CoachToolDeps } from '@/_bff/modules/coach/types'

const MAX_RANGE_DAYS = 100
const MAX_ROWS = 50

const spanDays = (from: string, to: string) =>
    Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / DAY_MS)

const inputSchema = z
    .object({
        from: plainDate,
        to: plainDate,
        category: z.enum(['run', 'hyrox', 'strength', 'cross', 'other']).optional(),
    })
    .refine(({ from, to }) => from <= to, { message: 'from must not be after to' })
    .refine(({ from, to }) => spanDays(from, to) <= MAX_RANGE_DAYS, {
        message: `range must be at most ${MAX_RANGE_DAYS} days`,
    })

export const makeGetActivitiesTool = (user: User, deps: CoachToolDeps): CoachTool => ({
    name: 'getActivities',
    description: `Lists the athlete activities between two dates (YYYY-MM-DD, at most ${MAX_RANGE_DAYS} days), newest first, at most ${MAX_ROWS} rows. Optional category filter.`,
    inputSchema,
    execute: (input) =>
        runTool(inputSchema, input, async ({ from, to, category }) => {
            const items = await deps.getCalendar(user, { from, to })
            const activities = items
                .flatMap((item) => (item.type === 'activity' ? [item.activity] : []))
                .filter((activity) => !category || activity.category === category)
                .toSorted(
                    (a, b) =>
                        (a.localDate < b.localDate ? 1 : a.localDate > b.localDate ? -1 : 0) ||
                        (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0)
                )

            return {
                activities: activities.slice(0, MAX_ROWS),
                truncated: Math.max(0, activities.length - MAX_ROWS),
            }
        }),
})
