import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { createCaller } from '@/_bff/trpc/caller'
import { Skeleton } from '@/components/ui/skeleton'
import { ActivityDetail } from '@/modules/activity/activity-detail'

type Props = PageProps<'/activities/[id]'>

export const metadata: Metadata = { title: 'Activity' }

const loadActivity = async (id: string) => {
    await connection()
    const caller = await createCaller()
    return caller.training.getActivity({ id })
}

export default function ActivityPage({ params }: Props) {
    return (
        <main className="main-container">
            <Suspense fallback={<ActivitySkeleton />}>
                <ActivityDetail params={params} load={loadActivity} />
            </Suspense>
        </main>
    )
}

function ActivitySkeleton() {
    return (
        <>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-16 w-2/3" />
            <Skeleton className="h-24 rounded-[var(--radius-surface-inner)]" />
            <Skeleton className="h-64 rounded-[var(--radius-surface-inner)]" />
        </>
    )
}
