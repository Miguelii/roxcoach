'use client'

import { todayIn } from '@/_bff/core/utils/date.utils'
import type { ProfileDTO } from '@/_bff/modules/athlete/types'
import { ActivityActions } from '@/components/activity-actions'
import { QueryError } from '@/components/query-error'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardControls } from '@/modules/dashboard/dashboard-controls'
import { RunProgress } from '@/modules/dashboard/progress/run-progress'
import { StrengthProgress } from '@/modules/dashboard/progress/strength-progress'
import { useDashboardMode } from '@/modules/dashboard/use-dashboard-mode'
import { useProgressRange } from '@/modules/dashboard/use-progress-range'
import { WeekStrip, WeekStripSkeleton } from '@/modules/dashboard/week-strip'

type Props = {
    // The profile the server prefetched. The shell's mode toggle creates the profile query before
    // the page hydrates, so the hydrated data only lands after commit; this covers the first render.
    initialProfile?: ProfileDTO | null
}

export function DashboardContent({ initialProfile }: Props) {
    const { profile } = useDashboardMode()
    const { range, setRange } = useProgressRange()
    const data = profile.data ?? initialProfile

    if (profile.isPending && !data) return <DashboardSkeleton />
    if (!data)
        return (
            <QueryError
                message="Could not load your profile."
                onRetry={() => void profile.refetch()}
                testId="dashboard-profile-error"
            />
        )

    const today = todayIn(data.timezone)

    return (
        <div data-testid="dashboard-content" className="space-y-6">
            <header className="space-y-4">
                <div className="space-y-2">
                    <h1 data-testid="dashboard-title" className="display text-4xl">
                        Progress
                    </h1>
                    <p className="max-w-[65ch] text-sm text-muted-foreground">
                        A clear view of your recent training and how it is building over time.
                    </p>
                </div>
                {/* One row: the range on the left, the two drawer actions at the far right. On a
                    phone the actions come first and the range sits below them. */}
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <DashboardControls
                        range={range}
                        onRangeChange={(next) => void setRange(next)}
                    />
                    <div className="w-full sm:w-auto">
                        <ActivityActions inline />
                    </div>
                </div>
            </header>
            <WeekStrip today={today} mode={data.dashboardMode} />
            {data.dashboardMode === 'run' ? (
                <RunProgress range={range} today={today} />
            ) : (
                <StrengthProgress range={range} />
            )}
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
            <Skeleton className="h-11 w-full sm:w-72" />
            <WeekStripSkeleton />
        </div>
    )
}
