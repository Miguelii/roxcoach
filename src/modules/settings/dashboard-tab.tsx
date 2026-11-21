'use client'

import { DashboardModeToggle } from '@/modules/dashboard/dashboard-mode-toggle'

// Which charts the dashboard shows, saved as it is picked. It has its own tab so it is not
// mistaken for a profile field. On a phone, where there is no sidebar, this is where it is changed.
export function DashboardTab() {
    return (
        <section data-testid="dashboard-settings" className="max-w-xl space-y-2">
            <h2 className="display text-xl">Dashboard</h2>
            <p className="text-sm text-muted-foreground">
                Choose the charts your dashboard shows. It is saved as you pick.
            </p>
            <DashboardModeToggle testIdPrefix="dashboard-mode" />
        </section>
    )
}
