import type { DashboardMode } from '@/_bff/core/constants/athlete.constants'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryError } from '@/components/query-error'
import { trpcClient } from '@/lib/trpc'
import { DASHBOARD_QUERY_STALE_TIME } from '@/modules/dashboard/constants'
import { addDays } from '@/_bff/core/utils/week-dates.utils'
import { WeekStripView } from '@/modules/dashboard/week-strip-view'

type Props = {
    today: string
    mode: DashboardMode
}

export function WeekStrip({ today, mode }: Props) {
    const query = trpcClient.training.getCalendar.useQuery(
        { from: addDays(today, -34), to: today },
        { staleTime: DASHBOARD_QUERY_STALE_TIME }
    )

    if (query.data === undefined && query.isPending) return <WeekStripSkeleton />
    if (query.data === undefined)
        return (
            <QueryError
                message="Could not load this week's training."
                onRetry={() => void query.refetch()}
                testId="week-strip-error"
            />
        )

    return (
        <>
            <WeekStripView items={query.data} today={today} mode={mode} />
            {query.isError && (
                <QueryError
                    message="Could not refresh this week's training."
                    onRetry={() => void query.refetch()}
                    testId="week-strip-refresh-error"
                />
            )}
        </>
    )
}

export function WeekStripSkeleton() {
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-28 rounded-[var(--radius-surface-inner)]" />
            ))}
        </div>
    )
}
