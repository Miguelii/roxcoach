'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ProgressRange } from '@/_bff/core/constants/progress.constants'
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
            {
                staleTime: DASHBOARD_QUERY_STALE_TIME,
                placeholderData: keepPreviousData,
                meta: { errorMessage: 'Could not load your strength progress.' },
            }
        )
    )

    if (query.data === undefined && query.isPending) return <StrengthProgressLoading />
    if (query.data === undefined) return null

    return <StrengthProgressView data={query.data} />
}
