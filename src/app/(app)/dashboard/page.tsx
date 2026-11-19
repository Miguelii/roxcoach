import type { Metadata } from 'next'
import { Suspense } from 'react'
import { DashboardContent, DashboardSkeleton } from '@/modules/dashboard/dashboard-content'

export const metadata: Metadata = { title: 'Dashboard' }

export default function DashboardPage() {
    return (
        <main className="main-container-lg">
            <Suspense fallback={<DashboardSkeleton />}>
                <DashboardContent />
            </Suspense>
        </main>
    )
}
