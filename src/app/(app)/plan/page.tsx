import type { Metadata } from 'next'
import { PlanView } from '@/modules/plan/plan-view'

export const metadata: Metadata = { title: 'Plan' }

export default function PlanPage() {
    return (
        <main className="main-container">
            <h1 className="display display-section">Plan</h1>
            <PlanView />
        </main>
    )
}
