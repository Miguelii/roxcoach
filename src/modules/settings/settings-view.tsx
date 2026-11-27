import { DashboardTab } from '@/modules/settings/dashboard-tab'
import { GoalsTab } from '@/modules/settings/goals-tab'
import { IntegrationsTab } from '@/modules/settings/integrations-tab'
import { ProfileTab } from '@/modules/settings/profile-tab'
import { SettingsTabs } from '@/modules/settings/settings-tabs'

type Props = { initialTab?: string }

export function SettingsView({ initialTab }: Props) {
    return (
        <div className="space-y-6">
            <h1 className="type-title">Settings</h1>
            <SettingsTabs
                profile={<ProfileTab />}
                dashboard={<DashboardTab />}
                goals={<GoalsTab />}
                integrations={<IntegrationsTab />}
                initialTab={initialTab}
            />
        </div>
    )
}
