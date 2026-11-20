'use client'

import { todayIn } from '@/_bff/core/utils/date.utils'
import { ActivityActions } from '@/components/activity-actions'
import { QueryError } from '@/components/query-error'
import { Skeleton } from '@/components/ui/skeleton'
import { trpcClient } from '@/lib/trpc'
import { WeekStrip, WeekStripSkeleton } from '@/modules/dashboard/week-strip'

export function DashboardContent() {
    const timezone = trpcClient.athlete.getTimezone.useQuery()

    if (timezone.isPending && timezone.data === undefined) return <DashboardSkeleton />
    if (timezone.data === undefined)
        return (
            <QueryError
                message="Could not load your timezone."
                onRetry={() => void timezone.refetch()}
                testId="dashboard-timezone-error"
            />
        )

    const today = todayIn(timezone.data)

    return (
        <div data-testid="dashboard-content" className="space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-2">
                    <h1 data-testid="dashboard-title" className="display text-4xl">
                        Progress
                    </h1>
                    <p className="max-w-[65ch] text-sm text-muted-foreground">
                        A clear view of your recent training and how it is building over time.
                    </p>
                </div>
                <ActivityActions />
            </header>
            <WeekStrip today={today} />
        </div>
    )
}

function DashboardSkeleton() {
    return (
        <div data-testid="dashboard-skeleton" className="space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-4 w-72 max-w-full" />
            </div>
            <WeekStripSkeleton />
        </div>
    )
}
