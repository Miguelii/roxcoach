'use client'

import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import type { HyroxDivision } from '@/_bff/core/constants/hyrox.constants'
import type { RaceDTO, RaceInput } from '@/_bff/modules/races/types'
import { Button } from '@/components/ui/button'
import { CompleteRaceDialog } from '@/modules/races/complete-race-dialog'
import { RaceCardView } from '@/modules/races/race-card-view'
import { RaceFormDialog } from '@/modules/races/race-form-dialog'
import { raceToFormValues } from '@/modules/races/use-race-form'

type Props = {
    races: RaceDTO[]
    today: string
    defaultDivision: HyroxDivision | null
    onCreate: (input: RaceInput) => Promise<void>
    onUpdate: (id: string, input: RaceInput) => Promise<void>
    onComplete: (id: string, resultTimeS: number) => Promise<void>
    onCancel: (id: string) => Promise<void>
    onDelete: (id: string) => Promise<void>
}

type Dialog =
    | { kind: 'create' }
    | { kind: 'edit'; race: RaceDTO }
    | { kind: 'complete'; race: RaceDTO }

// Upcoming races by date, then a collapsed history (completed and cancelled, newest first).
export function RacesList({
    races,
    today,
    defaultDivision,
    onCreate,
    onUpdate,
    onComplete,
    onCancel,
    onDelete,
}: Props) {
    const [dialog, setDialog] = useState<Dialog | null>(null)
    // Keeps the last dialog content mounted while the closing animation runs.
    const [last, setLast] = useState<Dialog>({ kind: 'create' })
    const open = (next: Dialog) => {
        setLast(next)
        setDialog(next)
    }
    const close = () => setDialog(null)

    const upcoming = races
        .filter((race) => race.status === 'upcoming')
        .toSorted((a, b) => a.raceDate.localeCompare(b.raceDate) || a.id.localeCompare(b.id))
    const history = races
        .filter((race) => race.status !== 'upcoming')
        .toSorted((a, b) => b.raceDate.localeCompare(a.raceDate) || a.id.localeCompare(b.id))

    const card = (race: RaceDTO) => (
        <RaceCardView
            key={race.id}
            race={race}
            today={today}
            onEdit={(item) => open({ kind: 'edit', race: item })}
            onComplete={(item) => open({ kind: 'complete', race: item })}
            onCancel={(item) => onCancel(item.id)}
            onDelete={(item) => onDelete(item.id)}
        />
    )

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Button data-testid="race-new" onClick={() => open({ kind: 'create' })}>
                    <PlusIcon />
                    New race
                </Button>
            </div>

            {races.length === 0 ? (
                <p data-testid="races-empty" className="text-sm text-muted-foreground">
                    No races yet. Add one to get a coach plan.
                </p>
            ) : null}

            {upcoming.length > 0 ? (
                <div data-testid="races-upcoming" className="grid gap-4 md:grid-cols-2">
                    {upcoming.map((race) => card(race))}
                </div>
            ) : null}

            {history.length > 0 ? (
                <details data-testid="races-history" className="space-y-4">
                    <summary className="cursor-pointer text-sm font-medium">
                        History ({history.length})
                    </summary>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {history.map((race) => card(race))}
                    </div>
                </details>
            ) : null}

            <RaceFormDialog
                mode={last.kind === 'edit' ? 'edit' : 'create'}
                defaults={last.kind === 'edit' ? raceToFormValues(last.race) : null}
                today={today}
                defaultDivision={defaultDivision}
                open={dialog?.kind === 'create' || dialog?.kind === 'edit'}
                onOpenChange={(next) => {
                    if (!next) close()
                }}
                onSubmit={async (input) => {
                    if (last.kind === 'edit') await onUpdate(last.race.id, input)
                    else await onCreate(input)
                }}
            />
            <CompleteRaceDialog
                race={last.kind === 'complete' ? last.race : null}
                open={dialog?.kind === 'complete'}
                onOpenChange={(next) => {
                    if (!next) close()
                }}
                onSubmit={onComplete}
            />
        </div>
    )
}
