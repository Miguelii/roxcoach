'use client'

import { useCallback } from 'react'
import { useQueryStates } from 'nuqs'
import { LOGS_SEARCH_PARAMS } from '@/modules/logs/logs-search-params'

// The range and search change what the server returns, so they are not shallow.
export function useLogsUrlState() {
    const [{ range, search }, setSearchParams] = useQueryStates(LOGS_SEARCH_PARAMS, {
        history: 'replace',
        shallow: false,
    })

    const setRange = useCallback(
        (nextRange: typeof range) => setSearchParams({ range: nextRange }),
        [setSearchParams]
    )
    const setSearch = useCallback(
        (nextSearch: string) => setSearchParams({ search: nextSearch || null }),
        [setSearchParams]
    )

    return { range, search, setRange, setSearch }
}
