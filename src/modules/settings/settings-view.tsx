import { AvailabilityTab } from '@/modules/settings/availability-tab'
import { ProfileTab } from '@/modules/settings/profile-tab'
import { SettingsTabs } from '@/modules/settings/settings-tabs'

export function SettingsView() {
    return (
        <div className="space-y-6">
            <h1 className="display display-section">Settings</h1>
            <SettingsTabs profile={<ProfileTab />} availability={<AvailabilityTab />} />
        </div>
    )
}
