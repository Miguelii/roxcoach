'use client'

import { keepPreviousData } from '@tanstack/react-query'
import type { ProgressRange } from '@/_bff/core/constants/progress.constants'
import { QueryError } from '@/components/query-error'
import { Skeleton } from '@/components/ui/skeleton'
import { trpcClient } from '@/lib/trpc'
import { DASHBOARD_QUERY_STALE_TIME } from '@/modules/dashboard/constants'
import { RunProgressView } from '@/modules/dashboard/progress/run-progress-view'

type Props = {
    range: ProgressRange
}

function RunProgressSkeleton() {
    return (
        <div data-testid="run-progress-skeleton" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="h-28 rounded-[var(--radius-surface-inner)]" />
                ))}
            </div>
            <Skeleton className="h-80 rounded-[var(--radius-surface)]" />
            <Skeleton className="h-80 rounded-[var(--radius-surface)]" />
        </div>
    )
}

export function RunProgress({ range }: Props) {
    const query = trpcClient.training.getRunProgress.useQuery(
        { range },
        { staleTime: DASHBOARD_QUERY_STALE_TIME, placeholderData: keepPreviousData }
    )

    if (query.data === undefined && query.isPending) return <RunProgressSkeleton />
    if (query.data === undefined)
        return (
            <QueryError
                message="Could not load your running progress."
                onRetry={() => void query.refetch()}
                testId="run-progress-error"
            />
        )

    return <RunProgressView data={query.data} />
}
