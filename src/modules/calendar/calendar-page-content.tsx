'use client'

import { todayIn } from '@/_bff/core/utils/date.utils'
import { ActivityActions } from '@/components/activity-actions'
import { QueryError } from '@/components/query-error'
import { Skeleton } from '@/components/ui/skeleton'
import { trpcClient } from '@/lib/trpc'
import { Calendar } from '@/modules/calendar/calendar'

export function CalendarPageContent() {
    const timezone = trpcClient.athlete.getTimezone.useQuery()

    if (timezone.isPending && timezone.data === undefined) {
        return (
            <div data-testid="calendar-page-skeleton" className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                    <Skeleton className="h-10 w-40" />
                    <Skeleton className="h-10 w-40 rounded-full" />
                </div>
                <Skeleton className="h-[36rem] rounded-[var(--radius-surface)]" />
            </div>
        )
    }

    if (timezone.data === undefined)
        return (
            <QueryError
                message="Could not load your timezone."
                onRetry={() => void timezone.refetch()}
                testId="calendar-timezone-error"
            />
        )

    return (
        <div data-testid="calendar-page-content" className="space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-2">
                    <h1 data-testid="calendar-page-title" className="display text-4xl">
                        Calendar
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Review your training and add completed activities.
                    </p>
                </div>
                <ActivityActions />
            </header>
            <Calendar today={todayIn(timezone.data)} />
        </div>
    )
}
