import type { Metadata } from 'next'
import { SettingsView } from '@/modules/settings/settings-view'

export const metadata: Metadata = { title: 'Settings' }

export default function SettingsPage() {
    return (
        <main className="main-container">
            <SettingsView />
        </main>
    )
}
