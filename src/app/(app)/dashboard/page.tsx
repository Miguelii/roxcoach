import type { Metadata } from 'next'
import { DashboardContent } from '@/modules/dashboard/dashboard-content'

export const metadata: Metadata = { title: 'Dashboard' }

export default function DashboardPage() {
    return (
        <main className="main-container-lg">
            <DashboardContent />
        </main>
    )
}
