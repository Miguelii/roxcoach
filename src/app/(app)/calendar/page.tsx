import type { Metadata } from 'next'
import { CalendarPageContent } from '@/modules/calendar/calendar-page-content'

export const metadata: Metadata = { title: 'Calendar' }

export default function CalendarPage() {
    return (
        <main className="main-container-lg">
            <CalendarPageContent />
        </main>
    )
}
