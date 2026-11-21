import { AvailabilityTab } from '@/modules/settings/availability-tab'
import { DashboardTab } from '@/modules/settings/dashboard-tab'
import { ProfileTab } from '@/modules/settings/profile-tab'
import { SettingsTabs } from '@/modules/settings/settings-tabs'
import { LyftaTab } from '@/modules/settings/lyfta-tab'

export function SettingsView() {
    return (
        <div className="space-y-6">
            <h1 className="display display-section">Settings</h1>
            <SettingsTabs
                profile={<ProfileTab />}
                dashboard={<DashboardTab />}
                availability={<AvailabilityTab />}
                lyfta={<LyftaTab />}
            />
        </div>
    )
}
