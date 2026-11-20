import { Skeleton } from '@/components/ui/skeleton'
import { trpcClient } from '@/lib/trpc'
import { DASHBOARD_QUERY_STALE_TIME } from '@/modules/dashboard/constants'
import { DashboardQueryError } from '@/modules/dashboard/dashboard-query-error'
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

    // Ordered by date: the first one not in the past is the next race.
    const next = query.data.find((race) => race.raceDate >= today) ?? null

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
