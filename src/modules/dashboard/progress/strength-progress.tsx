'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ProgressRange } from '@/_bff/core/constants/progress.constants'
import { QueryError } from '@/components/query-error'
import { useTRPC } from '@/lib/trpc'
import { DASHBOARD_QUERY_STALE_TIME } from '@/modules/dashboard/constants'
import {
    StrengthProgressLoading,
    StrengthProgressView,
} from '@/modules/dashboard/progress/strength-progress-view'

type Props = {
    range: ProgressRange
}

export function StrengthProgress({ range }: Props) {
    const trpc = useTRPC()
    const query = useQuery(
        trpc.training.getStrengthProgress.queryOptions(
            { range },
            { staleTime: DASHBOARD_QUERY_STALE_TIME, placeholderData: keepPreviousData }
        )
    )

    if (query.data === undefined && query.isPending) return <StrengthProgressLoading />
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
