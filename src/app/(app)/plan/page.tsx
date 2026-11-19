import type { Metadata } from 'next'
import { ComingSoon } from '@/components/coming-soon'

export const metadata: Metadata = { title: 'Plan' }

export default function PlanPage() {
    return (
        <main className="main-container">
            <ComingSoon
                title="Plan"
                description="Your training plan and the outlook toward each race will live here. It is not available yet."
            />
        </main>
    )
}
