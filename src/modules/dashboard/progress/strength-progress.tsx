'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ProgressRange } from '@/_bff/core/constants/progress.constants'
import { QueryError } from '@/components/query-error'
import { Skeleton } from '@/components/ui/skeleton'
import { useTRPC } from '@/lib/trpc'
import { DASHBOARD_QUERY_STALE_TIME } from '@/modules/dashboard/constants'
import { StrengthProgressView } from '@/modules/dashboard/progress/strength-progress-view'

type Props = {
    range: ProgressRange
}

function StrengthProgressSkeleton() {
    return (
        <div data-testid="strength-progress-skeleton" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} className="h-64 rounded-[var(--radius-surface)]" />
                ))}
            </div>
            <Skeleton className="h-80 rounded-[var(--radius-surface)]" />
        </div>
    )
}

export function StrengthProgress({ range }: Props) {
    const trpc = useTRPC()
    const query = useQuery(
        trpc.training.getStrengthProgress.queryOptions(
            { range },
            { staleTime: DASHBOARD_QUERY_STALE_TIME, placeholderData: keepPreviousData }
        )
    )

    if (query.data === undefined && query.isPending) return <StrengthProgressSkeleton />
    if (query.data === undefined)
        return (
            <QueryError
                message="Could not load your strength progress."
                onRetry={() => void query.refetch()}
                testId="strength-progress-error"
            />
        )

    return <StrengthProgressView data={query.data} />
}
