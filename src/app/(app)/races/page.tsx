import type { Metadata } from 'next'
import { RacesView } from '@/modules/races/races-view'

export const metadata: Metadata = { title: 'Races' }

export default function RacesPage() {
    return (
        <main className="main-container">
            <div className="space-y-6">
                <h1 className="type-title">Races</h1>
                <RacesView />
            </div>
        </main>
    )
}
