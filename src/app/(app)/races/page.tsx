import type { Metadata } from 'next'
import { Suspense } from 'react'
import { RacesSkeleton, RacesView } from '@/modules/races/races-view'

export const metadata: Metadata = { title: 'Races' }

export default function RacesPage() {
    return (
        <main className="main-container">
            <div className="space-y-6">
                <h1 className="display display-section">Races</h1>
                <Suspense fallback={<RacesSkeleton />}>
                    <RacesView />
                </Suspense>
            </div>
        </main>
    )
}
