'use client'

import { toast } from 'sonner'
import type { DashboardMode } from '@/_bff/core/constants/athlete.constants'
import { trpcClient } from '@/lib/trpc'

// Reads the athlete profile (timezone and dashboard mode) and saves the mode. Changing the mode
// updates the cached profile at once; a failed save puts the previous mode back and says so.
export function useDashboardMode() {
    const utils = trpcClient.useUtils()
    const profile = trpcClient.athlete.getProfile.useQuery()
    const save = trpcClient.athlete.setDashboardMode.useMutation({
        onMutate: async ({ mode }) => {
            await utils.athlete.getProfile.cancel()
            const previous = utils.athlete.getProfile.getData()
            utils.athlete.getProfile.setData(undefined, (current) =>
                current === undefined ? current : { ...current, dashboardMode: mode }
            )
            return { previous }
        },
        onError: (_error, _input, context) => {
            utils.athlete.getProfile.setData(undefined, context?.previous)
            toast.error('Could not save your dashboard mode.')
        },
        onSettled: () => void utils.athlete.getProfile.invalidate(),
    })

    const setMode = (mode: DashboardMode) => save.mutate({ mode })
    return { profile, setMode }
}
