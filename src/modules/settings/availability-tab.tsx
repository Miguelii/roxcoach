'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AvailabilitySlotDTO } from '@/_bff/modules/athlete/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTRPC } from '@/lib/trpc'
import { AvailabilityEditorView } from '@/modules/settings/availability-editor-view'

type DraftProps = { initial: AvailabilitySlotDTO[] }

function AvailabilityDraft({ initial }: DraftProps) {
    const trpc = useTRPC()
    const [slots, setSlots] = useState(initial)
    const queryClient = useQueryClient()
    const save = useMutation(trpc.athlete.saveAvailability.mutationOptions())

    const onSave = async () => {
        try {
            await save.mutateAsync(slots)
        } catch {
            toast.error('Could not save your availability. Try again.')
            return
        }
        toast.success('Availability saved')
        await queryClient.invalidateQueries(trpc.athlete.getAvailability.queryFilter())
    }

    return (
        <AvailabilityEditorView
            slots={slots}
            onChange={setSlots}
            onSave={() => void onSave()}
            saving={save.isPending}
        />
    )
}

// Thin wrapper: fetches the week and saves it. The editing logic is tested in the view and hook.
export function AvailabilityTab() {
    const trpc = useTRPC()
    const query = useQuery(trpc.athlete.getAvailability.queryOptions())

    if (query.isPending)
        return <Skeleton data-testid="availability-loading" className="h-72 w-full" />
    if (query.isError)
        return (
            <div data-testid="availability-error" className="space-y-3">
                <p className="text-sm text-destructive">Could not load your availability.</p>
                <Button
                    variant="outline"
                    data-testid="availability-retry"
                    onClick={() => void query.refetch()}
                >
                    Try again
                </Button>
            </div>
        )
    return <AvailabilityDraft initial={query.data} />
}
