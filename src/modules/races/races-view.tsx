'use client'

import { useQuery } from '@tanstack/react-query'
import { todayIn } from '@/_bff/core/utils/date.utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useTRPC } from '@/lib/trpc'
import { RacesManager } from '@/modules/races/races-manager'

const RACES_QUERY_STALE_TIME = 30_000

export function RacesView() {
    const trpc = useTRPC()
    const profile = useQuery(
        trpc.athlete.getProfile.queryOptions(undefined, {
            staleTime: RACES_QUERY_STALE_TIME,
            meta: { errorMessage: 'Could not load your races.' },
        })
    )
    const races = useQuery(
        trpc.races.list.queryOptions(
            {},
            {
                staleTime: RACES_QUERY_STALE_TIME,
                meta: { errorMessage: 'Could not load your races.' },
            }
        )
    )

    const missingData = profile.data === undefined || races.data === undefined
    const failed = missingData && (profile.isError || races.isError)

    if (failed) return null
    if (missingData) return <RacesSkeleton />

    return (
        <RacesManager
            races={races.data}
            today={todayIn(profile.data.timezone)}
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
