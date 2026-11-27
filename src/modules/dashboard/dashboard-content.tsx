'use client'

import { todayIn } from '@/_bff/core/utils/date.utils'
import type { DashboardMode } from '@/_bff/core/constants/athlete.constants'
import type { ProgressRange } from '@/_bff/core/constants/progress.constants'
import type { ProfileDTO } from '@/_bff/modules/athlete/types'
import { ActivityActions } from '@/components/activity-actions'
import { QueryError } from '@/components/query-error'
import { DashboardControls } from '@/modules/dashboard/dashboard-controls'
import { LOADING_DASHBOARD_MODE } from '@/modules/dashboard/constants'
import { RunProgress } from '@/modules/dashboard/progress/run-progress'
import { RunProgressLoading } from '@/modules/dashboard/progress/run-progress-view'
import { StrengthProgress } from '@/modules/dashboard/progress/strength-progress'
import { StrengthProgressLoading } from '@/modules/dashboard/progress/strength-progress-view'
import { useDashboardMode } from '@/modules/dashboard/use-dashboard-mode'
import { useProgressRange } from '@/modules/dashboard/use-progress-range'
import { WeekStrip } from '@/modules/dashboard/week-strip'
import { WeekStripLoading } from '@/modules/dashboard/week-strip-view'
import { WeeklyGoalsCard } from '@/modules/dashboard/weekly-goals-card'
import { WeeklyGoalsCardLoading } from '@/modules/dashboard/weekly-goals-card-view'

type Props = {
    // The profile the server prefetched. The shell's mode toggle creates the profile query before
    // the page hydrates, so the hydrated data only lands after commit; this covers the first render.
    initialProfile?: ProfileDTO | null
    // The layout drawn while there is no profile, from the remembered mode cookie.
    loadingMode?: DashboardMode
}

type BodyProps = {
    profile: ProfileDTO
    range: ProgressRange
}

type HeaderProps = {
    range: ProgressRange
    onRangeChange: (range: ProgressRange) => void
}

export function DashboardContent({ initialProfile, loadingMode = LOADING_DASHBOARD_MODE }: Props) {
    const { profile } = useDashboardMode()
    const { range, setRange } = useProgressRange()
    const data = profile.data ?? initialProfile

    if (!data && !profile.isPending)
        return (
            <QueryError
                message="Could not load your profile."
                onRetry={() => void profile.refetch()}
                testId="dashboard-profile-error"
            />
        )

    return (
        <div data-testid="dashboard-content" aria-busy={!data} className="space-y-6">
            <DashboardHeader range={range} onRangeChange={(next) => void setRange(next)} />
            {data ? (
                <DashboardBody profile={data} range={range} />
            ) : (
                <>
                    <WeekStripLoading mode={loadingMode} />
                    <WeeklyGoalsCardLoading />
                    {loadingMode === 'run' ? <RunProgressLoading /> : <StrengthProgressLoading />}
                </>
            )}
        </div>
    )
}

function DashboardHeader({ range, onRangeChange }: HeaderProps) {
    return (
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
                <DashboardControls range={range} onRangeChange={onRangeChange} />
                <div className="w-full sm:w-auto">
                    <ActivityActions inline />
                </div>
            </div>
        </header>
    )
}

function DashboardBody({ profile, range }: BodyProps) {
    const today = todayIn(profile.timezone)

    return (
        <>
            <WeekStrip today={today} mode={profile.dashboardMode} />
            <WeeklyGoalsCard today={today} mode={profile.dashboardMode} />
            {profile.dashboardMode === 'run' ? (
                <RunProgress range={range} today={today} />
            ) : (
                <StrengthProgress range={range} />
            )}
        </>
    )
}
