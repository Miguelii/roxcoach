import { AvailabilityTab } from '@/modules/settings/availability-tab'
import { DashboardTab } from '@/modules/settings/dashboard-tab'
import { ProfileTab } from '@/modules/settings/profile-tab'
import { SettingsLogsLink } from '@/modules/settings/settings-logs-link'
import { SettingsTabs } from '@/modules/settings/settings-tabs'
import { IntegrationsTab } from '@/modules/settings/integrations-tab'

export function SettingsView() {
    return (
        <div className="space-y-6">
            <h1 className="type-title">Settings</h1>
            <SettingsTabs
                profile={<ProfileTab />}
                dashboard={<DashboardTab />}
                availability={<AvailabilityTab />}
                integrations={<IntegrationsTab />}
            />
            <SettingsLogsLink />
        </div>
    )
}
