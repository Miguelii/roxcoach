'use client'

import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { HyroxDivision } from '@/_bff/core/constants/hyrox.constants'
import type { RaceDTO } from '@/_bff/modules/races/types'
import { useTRPC } from '@/lib/trpc'
import { RacesList } from '@/modules/races/races-list'
import { runRaceAction } from '@/modules/races/run-race-action'

type Props = {
    races: RaceDTO[]
    today: string
    defaultDivision: HyroxDivision | null
}

const BAD_REQUEST_COPY = 'Check the race details and try again'

// The failure was already toasted; card actions have no dialog to keep open.
const quiet = (promise: Promise<void>) =>
    promise.catch(() => {
        // Nothing more to do.
    })

// Thin wrapper: runs each mutation, toasts and refreshes the server data. Covered through
// RacesList; it only wires trpc.
export function RacesManager({ races, today, defaultDivision }: Props) {
    const trpc = useTRPC()
    const queryClient = useQueryClient()
    const create = useMutation(trpc.races.create.mutationOptions())
    const update = useMutation(trpc.races.update.mutationOptions())
    const complete = useMutation(trpc.races.complete.mutationOptions())
    const cancel = useMutation(trpc.races.cancel.mutationOptions())
    const restore = useMutation(trpc.races.restore.mutationOptions())
    const remove = useMutation(trpc.races.delete.mutationOptions())

    // Runs `action` with fixed copy, refreshing server data and invalidating client queries.
    const run = <Result,>(action: () => Promise<Result>, success: string, failure: string) =>
        runRaceAction({
            action,
            success,
            failure,
            badRequest: BAD_REQUEST_COPY,
            notifySuccess: (message) => toast.success(message),
            notifyFailure: (message) => toast.error(message),
            onChanged: () => {
                void queryClient.invalidateQueries(trpc.training.getCalendar.queryFilter())
                void queryClient.invalidateQueries(trpc.training.getRunProgress.queryFilter())
                void queryClient.invalidateQueries(trpc.races.list.queryFilter())
            },
        })

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
            onRestore={(id) =>
                quiet(
                    run(
                        () => restore.mutateAsync({ id }),
                        'Race restored',
                        'Could not restore the race. Try again.'
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
