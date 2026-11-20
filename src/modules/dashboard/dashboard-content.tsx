import { connection } from 'next/server'
import { Suspense } from 'react'
import { todayIn } from '@/_bff/core/utils/date.utils'
import { createCaller } from '@/_bff/trpc/caller'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar } from '@/modules/calendar/calendar'
import { NextRace } from '@/modules/dashboard/next-race'
import { UploadActivity } from '@/modules/dashboard/upload-activity'
import { WeekStrip } from '@/modules/dashboard/week-strip'

// Reads cookies through the caller, so it must render inside a Suspense boundary.
export async function DashboardContent() {
    // The tRPC auth middleware runs before any cookie read, so opt into request time explicitly.
    await connection()
    const caller = await createCaller()
    const today = todayIn(await caller.athlete.getTimezone())

    return (
        <>
            <div className="flex justify-end">
                <UploadActivity />
            </div>
            <Suspense fallback={<WeekStripSkeleton />}>
                <WeekStrip today={today} />
            </Suspense>
            <Suspense fallback={null}>
                <NextRace today={today} />
            </Suspense>
            <Calendar today={today} />
        </>
    )
}

function WeekStripSkeleton() {
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-28 rounded-[var(--radius-surface-inner)]" />
            ))}
        </div>
    )
}

export function DashboardSkeleton() {
    return (
        <>
            <WeekStripSkeleton />
            <Skeleton className="h-[36rem] rounded-[var(--radius-surface)]" />
        </>
    )
}
