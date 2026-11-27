import { useQuery } from '@tanstack/react-query'
import type { DashboardMode } from '@/_bff/core/constants/athlete.constants'
import { useTRPC } from '@/lib/trpc'
import { DASHBOARD_QUERY_STALE_TIME } from '@/modules/dashboard/constants'
import { weekStripWindow } from '@/modules/dashboard/utils'
import { WeekStripLoading, WeekStripView } from '@/modules/dashboard/week-strip-view'

type Props = {
    today: string
    mode: DashboardMode
}

export function WeekStrip({ today, mode }: Props) {
    const trpc = useTRPC()
    const query = useQuery(
        trpc.training.getCalendar.queryOptions(weekStripWindow(today), {
            staleTime: DASHBOARD_QUERY_STALE_TIME,
            meta: { errorMessage: "Could not load this week's training." },
        })
    )

    if (query.data === undefined && query.isPending) return <WeekStripLoading mode={mode} />
    if (query.data === undefined) return null

    return <WeekStripView items={query.data} today={today} mode={mode} />
}
