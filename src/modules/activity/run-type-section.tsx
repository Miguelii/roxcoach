'use client'

import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import type { ActivityDTO } from '@/_bff/modules/training/types'
import { useTRPC } from '@/lib/trpc'
import { RunTypeControl } from '@/modules/activity/run-type-control'

type Props = {
    activity: ActivityDTO
}

export function RunTypeSection({ activity }: Props) {
    const trpc = useTRPC()
    const queryClient = useQueryClient()
    const router = useRouter()
    const setRunType = useMutation(
        trpc.training.setRunType.mutationOptions({
            onError: () => {
                toast.error('Could not change the run type. Try again.')
            },
            onSuccess: () => {
                // The page renders server-loaded props, so only a refresh shows the new type.
                router.refresh()
                void queryClient.invalidateQueries(trpc.training.getActivity.queryFilter())
                void queryClient.invalidateQueries(trpc.training.getCalendar.queryFilter())
            },
        })
    )

    return (
        <RunTypeControl
            activityId={activity.id}
            runType={activity.runType}
            manual={activity.runTypeManual}
            pending={setRunType.isPending}
            onChange={(runType) => setRunType.mutate({ activityId: activity.id, runType })}
        />
    )
}
