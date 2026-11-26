'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DashboardMode } from '@/_bff/core/constants/athlete.constants'
import { useTRPC } from '@/lib/trpc'
import { DASHBOARD_QUERY_STALE_TIME } from '@/modules/dashboard/constants'
import { rememberDashboardMode } from '@/modules/dashboard/utils'

// Reads the athlete profile (timezone and dashboard mode) and saves the mode. Changing the mode
// updates the cached profile at once; a failed save puts the previous mode back and says so. The
// known mode is kept in a cookie so the next cold load draws the loading layout of that mode.
export function useDashboardMode() {
    const trpc = useTRPC()
    const queryClient = useQueryClient()
    const profile = useQuery(
        trpc.athlete.getProfile.queryOptions(undefined, {
            // The dashboard page hydrates the profile from the server; this keeps it from refetching at once.
            staleTime: DASHBOARD_QUERY_STALE_TIME,
        })
    )
    const save = useMutation(
        trpc.athlete.setDashboardMode.mutationOptions({
            onMutate: async ({ mode }) => {
                await queryClient.cancelQueries(trpc.athlete.getProfile.queryFilter())
                const previous = queryClient.getQueryData(trpc.athlete.getProfile.queryKey())
                queryClient.setQueryData(trpc.athlete.getProfile.queryKey(), (current) =>
                    current === undefined ? current : { ...current, dashboardMode: mode }
                )
                return { previous }
            },
            onError: (_error, _input, context) => {
                queryClient.setQueryData(trpc.athlete.getProfile.queryKey(), context?.previous)
                toast.error('Could not save your dashboard mode.')
            },
            onSettled: () =>
                void queryClient.invalidateQueries(trpc.athlete.getProfile.queryFilter()),
        })
    )

    const savedMode = profile.data?.dashboardMode
    useEffect(() => {
        if (savedMode !== undefined) rememberDashboardMode(savedMode)
    }, [savedMode])

    const setMode = (mode: DashboardMode) => save.mutate({ mode })
    return { profile, setMode }
}
