import type { Metadata } from 'next'
import { Calendar } from '@/modules/calendar/calendar'
import { LatestReport } from '@/modules/dashboard/latest-report'
import { NextUp } from '@/modules/dashboard/next-up'
import { WeekStrip } from '@/modules/dashboard/week-strip'

export const metadata: Metadata = { title: 'Dashboard' }

export default function DashboardPage() {
    return (
        <main className="main-container-lg">
            <WeekStrip />
            <NextUp />
            <Calendar />
            <LatestReport />
        </main>
    )
}
