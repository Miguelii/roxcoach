'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ProgressRange } from '@/_bff/core/constants/progress.constants'
import { useTRPC } from '@/lib/trpc'
import { DASHBOARD_QUERY_STALE_TIME } from '@/modules/dashboard/constants'
import { RunProgressLoading, RunProgressView } from '@/modules/dashboard/progress/run-progress-view'
import { weekStripWindow } from '@/modules/dashboard/utils'

type Props = {
    range: ProgressRange
    today: string
}

export function RunProgress({ range, today }: Props) {
    const trpc = useTRPC()
    const query = useQuery(
        trpc.training.getRunProgress.queryOptions(
            { range },
            {
                staleTime: DASHBOARD_QUERY_STALE_TIME,
                placeholderData: keepPreviousData,
                meta: { errorMessage: 'Could not load your running progress.' },
            }
        )
    )

    // The same window as the week strip, so both share one request.
    const calendar = useQuery(
        trpc.training.getCalendar.queryOptions(weekStripWindow(today), {
            staleTime: DASHBOARD_QUERY_STALE_TIME,
        })
    )

    if (query.data === undefined && query.isPending) return <RunProgressLoading />
    if (query.data === undefined) return null

    return <RunProgressView data={query.data} items={calendar.data ?? []} today={today} />
}
