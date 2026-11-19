import { StravaCard } from '@/modules/settings/strava-card'
import { parseStravaResult } from '@/modules/settings/strava-result'

type Props = {
    searchParams: Promise<{ strava?: string | string[] }>
}

// Awaits searchParams, so it must render inside a Suspense boundary.
export async function SettingsView({ searchParams }: Props) {
    const { strava } = await searchParams

    return (
        <div className="space-y-6">
            <h1 className="display display-section">Settings</h1>
            <StravaCard result={parseStravaResult(strava)} />
        </div>
    )
}
