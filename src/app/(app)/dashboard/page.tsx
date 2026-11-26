import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { todayIn } from '@/_bff/core/utils/date.utils'
import { getServerTrpc } from '@/lib/trpc-server'
import type { DashboardMode } from '@/_bff/core/constants/athlete.constants'
import {
    DASHBOARD_MODE_COOKIE,
    LOADING_DASHBOARD_MODE,
    loadProgressSearchParams,
} from '@/modules/dashboard/constants'
import { DashboardContent } from '@/modules/dashboard/dashboard-content'
import { modeFromCookie, weekStripWindow } from '@/modules/dashboard/utils'

type Props = PageProps<'/dashboard'>

type RememberedModeProps = Pick<Props, 'searchParams'>

type PrefetchedDashboardProps = RememberedModeProps & {
    loadingMode: DashboardMode
}

export const metadata: Metadata = { title: 'Dashboard' }

export default function DashboardPage({ searchParams }: Props) {
    return (
        <main className="main-container-lg">
            <Suspense fallback={<DashboardContent />}>
                <DashboardWithRememberedMode searchParams={searchParams} />
            </Suspense>
        </main>
    )
}

// The fallback is the dashboard itself, reading the client cache: a return visit shows the cached
// data at once while the server prefetch streams in. With an empty cache it draws its loading
// layout in the mode remembered by the cookie, which resolves at once (no query), so a strength
// athlete does not see the running layout first.
async function DashboardWithRememberedMode({ searchParams }: RememberedModeProps) {
    const loadingMode =
        modeFromCookie((await cookies()).get(DASHBOARD_MODE_COOKIE)?.value) ??
        LOADING_DASHBOARD_MODE

    return (
        <Suspense fallback={<DashboardContent loadingMode={loadingMode} />}>
            <PrefetchedDashboard searchParams={searchParams} loadingMode={loadingMode} />
        </Suspense>
    )
}

// Reads what the first paint needs on the server (profile, then the calendar window and the
// progress for the current mode in parallel) and hands it to the client cache, so the page opens
// with data instead of two client round-trips. A failed read is left out and the client query
// fetches it again with its own loading and error states.
async function PrefetchedDashboard({ searchParams, loadingMode }: PrefetchedDashboardProps) {
    // `searchParams` can resolve at prefetch time, so it does not stop prerendering. The procedures
    // run on Effect, whose clock reads `Date.now()`, so wait for the real request first.
    await connection()
    const { range } = await loadProgressSearchParams(searchParams)
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
            <DashboardContent initialProfile={profile} loadingMode={loadingMode} />
        </HydrationBoundary>
    )
}
