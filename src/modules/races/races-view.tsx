'use client'

import { todayIn } from '@/_bff/core/utils/date.utils'
import { QueryError } from '@/components/query-error'
import { Skeleton } from '@/components/ui/skeleton'
import { trpcClient } from '@/lib/trpc'
import { RacesManager } from '@/modules/races/races-manager'

const RACES_QUERY_STALE_TIME = 30_000

export function RacesView() {
    const timezone = trpcClient.athlete.getTimezone.useQuery(undefined, {
        staleTime: RACES_QUERY_STALE_TIME,
    })
    const profile = trpcClient.athlete.getProfile.useQuery(undefined, {
        staleTime: RACES_QUERY_STALE_TIME,
    })
    const races = trpcClient.races.list.useQuery(
        {},
        {
            staleTime: RACES_QUERY_STALE_TIME,
        }
    )

    const missingData =
        timezone.data === undefined || profile.data === undefined || races.data === undefined

    if (missingData) {
        const hasError = timezone.isError || profile.isError || races.isError

        if (hasError) {
            return (
                <QueryError
                    message="Could not load your races."
                    onRetry={() => {
                        void Promise.all([timezone.refetch(), profile.refetch(), races.refetch()])
                    }}
                    testId="races-page-error"
                />
            )
        }

        return <RacesSkeleton />
    }

    return (
        <RacesManager
            races={races.data}
            today={todayIn(timezone.data)}
            defaultDivision={profile.data.hyroxDivision}
        />
    )
}

function RacesSkeleton() {
    return (
        <div className="grid gap-4 md:grid-cols-2" data-testid="races-loading">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
        </div>
    )
}
