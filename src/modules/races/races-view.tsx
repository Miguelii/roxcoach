'use client'

import { useQuery } from '@tanstack/react-query'
import { todayIn } from '@/_bff/core/utils/date.utils'
import { QueryError } from '@/components/query-error'
import { Skeleton } from '@/components/ui/skeleton'
import { useTRPC } from '@/lib/trpc'
import { RacesManager } from '@/modules/races/races-manager'

const RACES_QUERY_STALE_TIME = 30_000

export function RacesView() {
    const trpc = useTRPC()
    const timezone = useQuery(
        trpc.athlete.getTimezone.queryOptions(undefined, {
            staleTime: RACES_QUERY_STALE_TIME,
        })
    )
    const profile = useQuery(
        trpc.athlete.getProfile.queryOptions(undefined, {
            staleTime: RACES_QUERY_STALE_TIME,
        })
    )
    const races = useQuery(
        trpc.races.list.queryOptions(
            {},
            {
                staleTime: RACES_QUERY_STALE_TIME,
            }
        )
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
