'use client'

import { todayIn } from '@/_bff/core/utils/date.utils'
import { Skeleton } from '@/components/ui/skeleton'
import { trpcClient } from '@/lib/trpc'
import { CoachChat } from '@/modules/coach/coach-chat'
import { Calendar } from '@/modules/calendar/calendar'
import { DashboardQueryError } from '@/modules/dashboard/dashboard-query-error'
import { NextRace } from '@/modules/dashboard/next-race'
import { UploadActivity } from '@/modules/dashboard/upload-activity'
import { WeekStrip, WeekStripSkeleton } from '@/modules/dashboard/week-strip'

export function DashboardContent() {
    const timezone = trpcClient.athlete.getTimezone.useQuery()

    if (timezone.isPending && timezone.data === undefined) return <DashboardSkeleton />
    if (timezone.data === undefined)
        return (
            <DashboardQueryError
                message="Could not load your timezone."
                onRetry={() => void timezone.refetch()}
                testId="dashboard-timezone-error"
            />
        )

    const today = todayIn(timezone.data)

    return (
        // Bottom padding keeps the last calendar row clear of the fixed chat launcher.
        <div className="space-y-6 pb-24">
            <div className="flex justify-end">
                <UploadActivity />
            </div>
            <WeekStrip today={today} />
            <NextRace today={today} />
            <Calendar today={today} />
            <CoachChat />
        </div>
    )
}

function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Skeleton className="h-10 w-40 rounded-full" />
            </div>
            <WeekStripSkeleton />
            <Skeleton className="h-[36rem] rounded-[var(--radius-surface)]" />
        </div>
    )
}
