import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getServerTrpc } from '@/lib/trpc-server'
import { CalendarPageContent } from '@/modules/calendar/calendar-page-content'

export const metadata: Metadata = { title: 'Calendar' }

export default function CalendarPage() {
    return (
        <main className="main-container-lg">
            {/* The fallback is the page itself, reading the client cache: a return visit draws the
                calendar at once while the server prefetch streams in. */}
            <Suspense fallback={<CalendarPageContent />}>
                <PrefetchedCalendar />
            </Suspense>
        </main>
    )
}

// Reads the profile on the server so the athlete timezone (which decides "today" and the default
// range) is known on the first paint, instead of waiting for a client round-trip behind a skeleton.
// A failed read is left out and the client query fetches it with its own loading and error states.
async function PrefetchedCalendar() {
    // The procedures run on Effect, whose clock reads `Date.now()`, so wait for the real request.
    await connection()
    const { queryClient, trpc } = getServerTrpc()
    const profile = await queryClient
        .query(trpc.athlete.getProfile.queryOptions())
        .catch(() => null)

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <CalendarPageContent initialTimezone={profile?.timezone ?? null} />
        </HydrationBoundary>
    )
}
