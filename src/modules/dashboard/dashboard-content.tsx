'use client'

import { todayIn } from '@/_bff/core/utils/date.utils'
import { ActivityActions } from '@/components/activity-actions'
import { QueryError } from '@/components/query-error'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardControls } from '@/modules/dashboard/dashboard-controls'
import { RunProgress } from '@/modules/dashboard/progress/run-progress'
import { useDashboardMode } from '@/modules/dashboard/use-dashboard-mode'
import { useProgressRange } from '@/modules/dashboard/use-progress-range'
import { WeekStrip, WeekStripSkeleton } from '@/modules/dashboard/week-strip'

export function DashboardContent() {
    const { profile, setMode } = useDashboardMode()
    const { range, setRange } = useProgressRange()

    if (profile.isPending && profile.data === undefined) return <DashboardSkeleton />
    if (profile.data === undefined)
        return (
            <QueryError
                message="Could not load your profile."
                onRetry={() => void profile.refetch()}
                testId="dashboard-profile-error"
            />
        )

    const today = todayIn(profile.data.timezone)

    return (
        <div data-testid="dashboard-content" className="space-y-6">
            <header className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="space-y-2">
                        <h1 data-testid="dashboard-title" className="display text-4xl">
                            Progress
                        </h1>
                        <p className="max-w-[65ch] text-sm text-muted-foreground">
                            A clear view of your recent training and how it is building over time.
                        </p>
                    </div>
                    <ActivityActions />
                </div>
                <DashboardControls
                    mode={profile.data.dashboardMode}
                    onModeChange={setMode}
                    range={range}
                    onRangeChange={(next) => void setRange(next)}
                />
            </header>
            <WeekStrip today={today} />
            {profile.data.dashboardMode === 'run' ? (
                <RunProgress range={range} />
            ) : (
                <div data-testid="progress-placeholder" data-mode="strength" />
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
