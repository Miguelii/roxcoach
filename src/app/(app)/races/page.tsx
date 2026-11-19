import type { Metadata } from 'next'
import { ComingSoon } from '@/components/coming-soon'

export const metadata: Metadata = { title: 'Races' }

export default function RacesPage() {
    return (
        <main className="main-container">
            <ComingSoon
                title="Races"
                description="Race goals and results will live here. Racing is not available yet."
            />
        </main>
    )
}
