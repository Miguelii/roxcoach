'use client'

import { useState } from 'react'
import {
    IconCalendar,
    IconCheck,
    IconFlag,
    IconMapPin,
    IconPencil,
    IconTrash,
    IconX,
} from '@tabler/icons-react'
import { HYROX_DIVISIONS } from '@/_bff/core/constants/hyrox.constants'
import { formatClock, formatPaceSeconds } from '@/_bff/core/utils/formatters.utils'
import { racePaceSPerKm } from '@/_bff/core/utils/race-pace.utils'
import type { RaceDTO } from '@/_bff/modules/races/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { RaceConfirmationDialog } from '@/modules/races/race-confirmation-dialog'
import {
    PRIORITY_LABELS,
    RACE_TYPE_LABELS,
    daysUntil,
    formatDaysToGo,
    formatDelta,
    formatRaceDate,
} from '@/modules/races/utils'

type Props = {
    race: RaceDTO
    today: string
    // True while a mutation for this race runs: the actions are disabled.
    pending?: boolean
    onEdit: (race: RaceDTO) => void
    onComplete: (race: RaceDTO) => void
    onCancel: (race: RaceDTO) => Promise<void> | void
    onDelete: (race: RaceDTO) => Promise<void> | void
}

type Confirming = 'cancel' | 'delete' | null

type Tone = 'amber' | 'blue' | 'slate' | 'green'

const PRIORITY_TONES: Record<RaceDTO['priority'], Tone> = { A: 'amber', B: 'blue', C: 'slate' }

const toneOf = (race: RaceDTO): Tone => {
    if (race.status === 'completed') return 'green'
    if (race.status === 'cancelled') return 'slate'
    return PRIORITY_TONES[race.priority]
}

const typeText = (race: RaceDTO) => {
    const base = RACE_TYPE_LABELS[race.raceType]
    const division = HYROX_DIVISIONS.find((item) => item.key === race.hyroxDivision)
    return division ? `${base} (${division.label})` : base
}

export function RaceCardView({
    race,
    today,
    pending = false,
    onEdit,
    onComplete,
    onCancel,
    onDelete,
}: Props) {
    const [confirming, setConfirming] = useState<Confirming>(null)
    const [lastConfirmation, setLastConfirmation] = useState<Exclude<Confirming, null>>('cancel')
    const { id } = race
    const upcoming = race.status === 'upcoming'
    const pace = upcoming ? formatPaceSeconds(racePaceSPerKm(race)) : null
    const delta = formatDelta(race.targetTimeS, race.resultTimeS)

    return (
        <div
            data-testid={`race-card-${id}`}
            data-tone={toneOf(race)}
            className={cn('flex h-full flex-col ', race.status === 'cancelled' && 'opacity-80')}
        >
            <div className="flex flex-1 flex-col gap-5 rounded-[var(--radius-surface)] bg-card p-5 shadow-soft md:p-6">
                <div className="space-y-3">
                    <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span
                                data-testid={`race-priority-${id}`}
                                className="inline-flex items-center gap-1.5 rounded-full bg-tone-soft px-2.5 py-1 text-xs font-medium text-tone-deep"
                            >
                                <IconFlag className="size-3.5" aria-hidden="true" />
                                {PRIORITY_LABELS[race.priority]}
                            </span>
                            {race.status === 'cancelled' ? (
                                <span
                                    data-testid={`race-status-${id}`}
                                    className="rounded-full border border-ink/15 px-2.5 py-1 text-xs font-medium text-muted-foreground"
                                >
                                    Cancelled
                                </span>
                            ) : null}
                        </div>
                        <h3 className="display min-h-[2.5em] text-2xl leading-tight [overflow-wrap:anywhere] md:text-3xl">
                            {race.name}
                        </h3>
                        <p className="grid min-h-[3.25rem] content-start gap-1 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                                <IconCalendar className="size-4" aria-hidden="true" />
                                {formatRaceDate(race.raceDate)}
                            </span>
                            {race.location ? (
                                <span
                                    data-testid={`race-location-${id}`}
                                    className="inline-flex items-center gap-1.5"
                                >
                                    <IconMapPin className="size-4" aria-hidden="true" />
                                    {race.location}
                                </span>
                            ) : null}
                        </p>
                    </div>

                    {upcoming ? (
                        <div className="rounded-[var(--radius-surface-inner)] bg-tone-soft px-4 py-3 text-tone-deep">
                            <p data-testid={`race-days-${id}`} className="display text-3xl">
                                {formatDaysToGo(daysUntil(today, race.raceDate))}
                            </p>
                        </div>
                    ) : null}
                </div>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-hairline pt-4 sm:grid-cols-3">
                    <div className="min-w-0">
                        <dt className="eyebrow text-muted-foreground">Race</dt>
                        <dd data-testid={`race-type-${id}`} className="mt-1 text-sm font-medium">
                            {typeText(race)}
                        </dd>
                    </div>
                    <div className="min-w-0">
                        <p data-testid={`race-goal-${id}`}>
                            <span className="eyebrow block text-muted-foreground">Goal</span>{' '}
                            <span className="mt-1 block font-mono text-lg tabular-nums">
                                {formatClock(race.targetTimeS)}
                            </span>
                        </p>
                    </div>
                    {pace ? (
                        <div className="min-w-0">
                            <p data-testid={`race-pace-${id}`}>
                                <span className="eyebrow block text-muted-foreground">
                                    Required pace
                                </span>{' '}
                                <span className="mt-1 block font-mono text-lg tabular-nums">
                                    {pace}
                                </span>
                            </p>
                        </div>
                    ) : null}
                    {race.resultTimeS === null ? null : (
                        <div className="min-w-0">
                            <p data-testid={`race-result-${id}`}>
                                <span className="eyebrow block text-muted-foreground">Result</span>{' '}
                                <span className="mt-1 block font-mono text-lg tabular-nums">
                                    {formatClock(race.resultTimeS)}
                                </span>
                            </p>
                        </div>
                    )}
                </dl>

                {delta ? (
                    <p
                        data-testid={`race-delta-${id}`}
                        data-tone={
                            race.resultTimeS !== null && race.resultTimeS > race.targetTimeS
                                ? 'red'
                                : 'green'
                        }
                        className="inline-flex rounded-full bg-tone-soft px-3 py-1 text-sm font-medium text-tone-deep"
                    >
                        {delta}
                    </p>
                ) : null}

                {race.notes ? (
                    <p
                        data-testid={`race-notes-${id}`}
                        className="rounded-[var(--radius-surface-inner)] bg-muted px-3 py-2.5 text-sm text-muted-foreground"
                    >
                        {race.notes}
                    </p>
                ) : null}

                <div className="mt-auto flex flex-col gap-2 border-t border-hairline pt-4 sm:flex-row sm:flex-wrap">
                    {upcoming ? (
                        <>
                            <Button
                                disabled={pending}
                                className="max-md:h-11!"
                                data-testid={`race-edit-${id}`}
                                onClick={() => onEdit(race)}
                            >
                                <IconPencil aria-hidden="true" /> Edit
                            </Button>
                            {race.raceDate <= today ? (
                                <Button
                                    disabled={pending}
                                    variant="tone"
                                    className="max-md:h-11!"
                                    data-testid={`race-complete-${id}`}
                                    onClick={() => onComplete(race)}
                                >
                                    <IconCheck aria-hidden="true" /> Complete
                                </Button>
                            ) : null}
                            <Button
                                disabled={pending}
                                variant="outline"
                                className="max-md:h-11!"
                                data-testid={`race-cancel-${id}`}
                                onClick={() => {
                                    setLastConfirmation('cancel')
                                    setConfirming('cancel')
                                }}
                            >
                                <IconX aria-hidden="true" /> Cancel
                            </Button>
                        </>
                    ) : null}
                    {race.resultTimeS === null ? (
                        <Button
                            disabled={pending}
                            variant="destructive"
                            className="max-md:h-11! sm:ml-auto"
                            data-testid={`race-delete-${id}`}
                            onClick={() => {
                                setLastConfirmation('delete')
                                setConfirming('delete')
                            }}
                        >
                            <IconTrash aria-hidden="true" /> Delete
                        </Button>
                    ) : null}
                </div>

                <RaceConfirmationDialog
                    race={race}
                    action={confirming ?? lastConfirmation}
                    open={confirming !== null}
                    onOpenChange={(open) => {
                        if (!open) setConfirming(null)
                    }}
                    onConfirm={() => {
                        const action = confirming === 'cancel' ? onCancel : onDelete
                        return action(race)
                    }}
                />
            </div>
        </div>
    )
}
