import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { todayIn } from '@/_bff/core/utils/date.utils'
import { getServerTrpc } from '@/lib/trpc-server'
import { PROGRESS_RANGE_PARSER } from '@/modules/dashboard/constants'
import { DashboardContent, DashboardSkeleton } from '@/modules/dashboard/dashboard-content'
import { weekStripWindow } from '@/modules/dashboard/utils'

type Props = PageProps<'/dashboard'>

type PrefetchedDashboardProps = Pick<Props, 'searchParams'>

export const metadata: Metadata = { title: 'Dashboard' }

export default function DashboardPage({ searchParams }: Props) {
    return (
        <main className="main-container-lg">
            <Suspense fallback={<DashboardSkeleton />}>
                <PrefetchedDashboard searchParams={searchParams} />
            </Suspense>
        </main>
    )
}

// Reads what the first paint needs on the server (profile, then the calendar window and the
// progress for the current mode in parallel) and hands it to the client cache, so the page opens
// with data instead of two client round-trips. A failed read is left out and the client query
// fetches it again with its own loading and error states.
async function PrefetchedDashboard({ searchParams }: PrefetchedDashboardProps) {
    // `searchParams` can resolve at prefetch time, so it does not stop prerendering. The procedures
    // run on Effect, whose clock reads `Date.now()`, so wait for the real request first.
    await connection()
    const range = PROGRESS_RANGE_PARSER.parseServerSide((await searchParams).range)
    const { queryClient, trpc } = getServerTrpc()
    const profile = await queryClient
        .query(trpc.athlete.getProfile.queryOptions())
        .catch(() => null)

    if (profile) {
        const today = todayIn(profile.timezone)
        // A prefetch only fills the cache, so its error is swallowed (the client query retries).
        await Promise.all([
            queryClient
                .query(trpc.training.getCalendar.queryOptions(weekStripWindow(today)))
                .catch(() => null),
            profile.dashboardMode === 'run'
                ? queryClient
                      .query(trpc.training.getRunProgress.queryOptions({ range }))
                      .catch(() => null)
                : queryClient
                      .query(trpc.training.getStrengthProgress.queryOptions({ range }))
                      .catch(() => null),
        ])
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <DashboardContent initialProfile={profile} />
        </HydrationBoundary>
    )
}
