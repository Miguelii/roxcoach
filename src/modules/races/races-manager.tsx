'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { HyroxDivision } from '@/_bff/core/constants/hyrox.constants'
import type { RaceDTO } from '@/_bff/modules/races/types'
import { trpcClient } from '@/lib/trpc'
import { RacesList } from '@/modules/races/races-list'

type Props = {
    races: RaceDTO[]
    today: string
    defaultDivision: HyroxDivision | null
}

// The failure was already toasted; card actions have no dialog to keep open.
const quiet = (promise: Promise<void>) =>
    promise.catch(() => {
        // Nothing more to do.
    })

// Thin wrapper: runs each mutation, toasts and refreshes the server data. Covered through
// RacesList; it only wires trpc.
export function RacesManager({ races, today, defaultDivision }: Props) {
    const router = useRouter()
    const create = trpcClient.races.create.useMutation()
    const update = trpcClient.races.update.useMutation()
    const complete = trpcClient.races.complete.useMutation()
    const cancel = trpcClient.races.cancel.useMutation()
    const remove = trpcClient.races.delete.useMutation()

    // Runs `action`, then toasts. A failure toasts the fixed error copy and rethrows so a dialog
    // stays open.
    const run = async <Result,>(
        action: () => Promise<Result>,
        success: string,
        failure: string
    ) => {
        try {
            await action()
        } catch (error) {
            toast.error(failure)
            throw error
        }
        toast.success(success)
        router.refresh()
    }

    return (
        <RacesList
            races={races}
            today={today}
            defaultDivision={defaultDivision}
            onCreate={(input) =>
                run(
                    () => create.mutateAsync(input),
                    'Race added',
                    'Could not add the race. Try again.'
                )
            }
            onUpdate={(id, input) =>
                run(
                    () => update.mutateAsync({ id, race: input }),
                    'Race saved',
                    'Could not save the race. Try again.'
                )
            }
            onComplete={(id, resultTimeS) =>
                run(
                    () => complete.mutateAsync({ id, resultTimeS }),
                    'Result saved',
                    'Could not save the result. Try again.'
                )
            }
            onCancel={(id) =>
                quiet(
                    run(
                        () => cancel.mutateAsync({ id }),
                        'Race cancelled',
                        'Could not cancel the race. Try again.'
                    )
                )
            }
            onDelete={(id) =>
                quiet(
                    run(
                        () => remove.mutateAsync({ id }),
                        'Race deleted',
                        'Could not delete the race. Try again.'
                    )
                )
            }
        />
    )
}
