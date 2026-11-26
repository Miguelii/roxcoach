'use client'

import type { DashboardMode } from '@/_bff/core/constants/athlete.constants'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardModeSwitch } from '@/modules/dashboard/dashboard-mode-switch'
import { useDashboardMode } from '@/modules/dashboard/use-dashboard-mode'

type Props = {
    testIdPrefix: string
    compact?: boolean
    // The mode remembered in the cookie, shown until the profile arrives.
    initialMode?: DashboardMode | null
}

// The dashboard mode switch wired to the profile: it shows the saved mode and saves a change at
// once. Used where the athlete picks the mode, outside the dashboard page.
export function DashboardModeToggle({ testIdPrefix, compact = false, initialMode = null }: Props) {
    const { profile, setMode } = useDashboardMode()
    const mode = profile.data?.dashboardMode ?? initialMode

    if (mode === null)
        return (
            <Skeleton
                data-testid={`${testIdPrefix}-loading`}
                className={compact ? 'h-9 w-full' : 'h-11 w-full sm:h-9'}
            />
        )

    return (
        <DashboardModeSwitch
            mode={mode}
            onChange={setMode}
            testIdPrefix={testIdPrefix}
            compact={compact}
        />
    )
}
