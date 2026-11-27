'use client'

import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { WeeklyGoals } from '@/_bff/core/constants/weekly-goals.constants'
import { Skeleton } from '@/components/ui/skeleton'
import { useTRPC } from '@/lib/trpc'
import { GoalsForm } from '@/modules/settings/goals-form'
import { toGoalsFormValues } from '@/modules/settings/use-goals-form'

const savedMessage = (reclassified: number) => {
    if (reclassified === 0) return 'Goals saved'
    return `Goals saved. ${reclassified} ${reclassified === 1 ? 'run' : 'runs'} reclassified.`
}

export function GoalsTab() {
    const trpc = useTRPC()
    const query = useQuery(
        trpc.athlete.getWeeklyGoals.queryOptions(undefined, {
            meta: { errorMessage: 'Could not load your goals.' },
        })
    )
    const queryClient = useQueryClient()
    const save = useMutation(trpc.athlete.saveWeeklyGoals.mutationOptions())

    if (query.isPending) return <Skeleton data-testid="goals-loading" className="h-96 max-w-xl" />
    if (query.data === undefined) return null

    const onSubmit = async (values: WeeklyGoals) => {
        let reclassified: number
        try {
            reclassified = (await save.mutateAsync(values)).reclassified
        } catch (error) {
            toast.error('Could not save your goals. Try again.')
            throw error
        }
        toast.success(savedMessage(reclassified))
        void queryClient.invalidateQueries(trpc.athlete.getWeeklyGoals.queryFilter())
        void queryClient.invalidateQueries(trpc.training.getCalendar.queryFilter())
        void queryClient.invalidateQueries(trpc.training.getActivity.queryFilter())
    }

    return <GoalsForm defaults={toGoalsFormValues(query.data)} onSubmit={onSubmit} />
}
