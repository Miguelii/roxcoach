import { useQuery } from '@tanstack/react-query'
import type { DashboardMode } from '@/_bff/core/constants/athlete.constants'
import { computeWeeklyGoalProgress } from '@/_bff/core/utils/weekly-goals.utils'
import { useTRPC } from '@/lib/trpc'
import { DASHBOARD_QUERY_STALE_TIME } from '@/modules/dashboard/constants'
import { weekStripWindow } from '@/modules/dashboard/utils'
import {
    WeeklyGoalsCardLoading,
    WeeklyGoalsCardView,
} from '@/modules/dashboard/weekly-goals-card-view'

type Props = {
    today: string
    mode: DashboardMode
}

export function WeeklyGoalsCard({ today, mode }: Props) {
    const trpc = useTRPC()
    const goals = useQuery(
        trpc.athlete.getWeeklyGoals.queryOptions(undefined, {
            meta: { errorMessage: "Could not load this week's goals." },
        })
    )
    const calendar = useQuery(
        trpc.training.getCalendar.queryOptions(weekStripWindow(today), {
            staleTime: DASHBOARD_QUERY_STALE_TIME,
        })
    )

    if (goals.data === undefined || calendar.data === undefined) {
        if (goals.isPending || calendar.isPending) return <WeeklyGoalsCardLoading />
        return null
    }

    return (
        <WeeklyGoalsCardView
            mode={mode}
            progress={computeWeeklyGoalProgress({ goals: goals.data, items: calendar.data, today })}
        />
    )
}
