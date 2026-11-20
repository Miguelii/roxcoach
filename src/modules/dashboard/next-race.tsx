import { Skeleton } from '@/components/ui/skeleton'
import { trpcClient } from '@/lib/trpc'
import { DASHBOARD_QUERY_STALE_TIME } from '@/modules/dashboard/constants'
import { DashboardQueryError } from '@/modules/dashboard/dashboard-query-error'
import { pickNextRace } from '@/modules/dashboard/pick-next-race'
import { NextRaceView } from '@/modules/dashboard/next-race-view'

type Props = {
    today: string
}

export function NextRace({ today }: Props) {
    const query = trpcClient.races.list.useQuery(
        { status: ['upcoming'] },
        { staleTime: DASHBOARD_QUERY_STALE_TIME }
    )

    if (query.data === undefined && query.isPending)
        return <Skeleton className="h-20 rounded-[var(--radius-surface-inner)]" />
    if (query.data === undefined)
        return (
            <DashboardQueryError
                message="Could not load your next race."
                onRetry={() => void query.refetch()}
                testId="next-race-error"
            />
        )

    const next = pickNextRace(query.data, today)

    return (
        <>
            <NextRaceView race={next} today={today} />
            {query.isError && (
                <DashboardQueryError
                    message="Could not refresh your next race."
                    onRetry={() => void query.refetch()}
                    testId="next-race-refresh-error"
                />
            )}
        </>
    )
}
