import type { Metadata } from 'next'
import { ComingSoon } from '@/components/coming-soon'

export const metadata: Metadata = { title: 'Coach' }

export default function CoachPage() {
    return (
        <main className="main-container">
            <ComingSoon
                title="Coach"
                description="Weekly coach reports will live here. Reports are not available yet."
            />
        </main>
    )
}
