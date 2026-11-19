import type { Metadata } from 'next'
import { ComingSoon } from '@/components/coming-soon'

export const metadata: Metadata = { title: 'Settings' }

export default function SettingsPage() {
    return (
        <main className="main-container">
            <ComingSoon
                title="Settings"
                description="Profile and Strava settings will live here. They are not available yet."
            />
        </main>
    )
}
