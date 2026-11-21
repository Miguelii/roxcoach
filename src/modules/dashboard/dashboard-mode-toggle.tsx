'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { DashboardModeSwitch } from '@/modules/dashboard/dashboard-mode-switch'
import { useDashboardMode } from '@/modules/dashboard/use-dashboard-mode'

type Props = {
    testIdPrefix: string
    compact?: boolean
}

// The dashboard mode switch wired to the profile: it shows the saved mode and saves a change at
// once. Used where the athlete picks the mode, outside the dashboard page.
export function DashboardModeToggle({ testIdPrefix, compact = false }: Props) {
    const { profile, setMode } = useDashboardMode()

    if (profile.data === undefined)
        return (
            <Skeleton
                data-testid={`${testIdPrefix}-loading`}
                className={compact ? 'h-9 w-full' : 'h-11 w-full sm:h-9'}
            />
        )

    return (
        <DashboardModeSwitch
            mode={profile.data.dashboardMode}
            onChange={setMode}
            testIdPrefix={testIdPrefix}
            compact={compact}
        />
    )
}
