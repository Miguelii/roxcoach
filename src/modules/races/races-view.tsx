import { connection } from 'next/server'
import { todayIn } from '@/_bff/core/utils/date.utils'
import { createCaller } from '@/_bff/trpc/caller'
import { Skeleton } from '@/components/ui/skeleton'
import { RacesManager } from '@/modules/races/races-manager'

// Reads cookies through the caller, so it must render inside a Suspense boundary.
export async function RacesView() {
    await connection()
    const caller = await createCaller()
    const [timezone, profile, races] = await Promise.all([
        caller.athlete.getTimezone(),
        caller.athlete.getProfile(),
        caller.races.list({}),
    ])

    return (
        <RacesManager
            races={races}
            today={todayIn(timezone)}
            defaultDivision={profile.hyroxDivision}
        />
    )
}

export function RacesSkeleton() {
    return (
        <div className="grid gap-4 md:grid-cols-2" data-testid="races-loading">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
        </div>
    )
}
