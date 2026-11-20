'use client'

import { useState } from 'react'
import { HYROX_DIVISIONS } from '@/_bff/core/constants/hyrox.constants'
import { requiredPaceMps } from '@/_bff/core/helpers/race-pace.helper'
import { formatClock, formatPace } from '@/_bff/core/utils/formatters.utils'
import type { RaceDTO } from '@/_bff/modules/races/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
    onEdit: (race: RaceDTO) => void
    onComplete: (race: RaceDTO) => void
    onCancel: (race: RaceDTO) => Promise<void> | void
    onDelete: (race: RaceDTO) => Promise<void> | void
}

type Confirming = 'cancel' | 'delete' | null

const typeText = (race: RaceDTO) => {
    const base = RACE_TYPE_LABELS[race.raceType]
    const division = HYROX_DIVISIONS.find((item) => item.key === race.hyroxDivision)
    return division ? `${base} (${division.label})` : base
}

export function RaceCardView({ race, today, onEdit, onComplete, onCancel, onDelete }: Props) {
    const [confirming, setConfirming] = useState<Confirming>(null)
    const { id } = race
    const upcoming = race.status === 'upcoming'
    const pace =
        upcoming && race.raceType === 'running' && race.distanceM !== null
            ? formatPace(requiredPaceMps(race.distanceM, race.targetTimeS))
            : null
    const delta = formatDelta(race.targetTimeS, race.resultTimeS)

    return (
        <Card data-testid={`race-card-${id}`}>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <h3 className="font-medium">{race.name}</h3>
                        <p className="text-sm text-muted-foreground">
                            {formatRaceDate(race.raceDate)}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {race.status === 'cancelled' ? (
                            <Badge variant="outline" data-testid={`race-status-${id}`}>
                                Cancelled
                            </Badge>
                        ) : null}
                        <Badge variant="secondary" data-testid={`race-priority-${id}`}>
                            {PRIORITY_LABELS[race.priority]}
                        </Badge>
                    </div>
                </div>

                <div className="grid gap-1 text-sm">
                    {upcoming ? (
                        <p data-testid={`race-days-${id}`} className="font-medium">
                            {formatDaysToGo(daysUntil(today, race.raceDate))}
                        </p>
                    ) : null}
                    <p data-testid={`race-type-${id}`}>{typeText(race)}</p>
                    {race.location ? (
                        <p data-testid={`race-location-${id}`} className="text-muted-foreground">
                            {race.location}
                        </p>
                    ) : null}
                    <p data-testid={`race-goal-${id}`}>Goal {formatClock(race.targetTimeS)}</p>
                    {pace ? (
                        <p data-testid={`race-pace-${id}`} className="text-muted-foreground">
                            Required pace {pace}
                        </p>
                    ) : null}
                    {race.resultTimeS !== null ? (
                        <p data-testid={`race-result-${id}`}>
                            Result {formatClock(race.resultTimeS)}
                        </p>
                    ) : null}
                    {delta ? (
                        <p data-testid={`race-delta-${id}`} className="text-muted-foreground">
                            {delta}
                        </p>
                    ) : null}
                    {race.notes ? (
                        <p data-testid={`race-notes-${id}`} className="text-muted-foreground">
                            {race.notes}
                        </p>
                    ) : null}
                </div>

                {confirming ? (
                    <div data-testid={`race-confirm-${id}`} className="space-y-2">
                        <p className="text-sm">
                            {confirming === 'cancel'
                                ? 'Cancel this race? It moves to your history.'
                                : 'Delete this race? This cannot be undone.'}
                        </p>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="destructive"
                                data-testid={`race-confirm-yes-${id}`}
                                onClick={async () => {
                                    const action = confirming === 'cancel' ? onCancel : onDelete
                                    setConfirming(null)
                                    await action(race)
                                }}
                            >
                                {confirming === 'cancel' ? 'Cancel race' : 'Delete race'}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                data-testid={`race-confirm-no-${id}`}
                                onClick={() => setConfirming(null)}
                            >
                                Keep it
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {upcoming ? (
                            <>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    data-testid={`race-edit-${id}`}
                                    onClick={() => onEdit(race)}
                                >
                                    Edit
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    data-testid={`race-complete-${id}`}
                                    onClick={() => onComplete(race)}
                                >
                                    Complete
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    data-testid={`race-cancel-${id}`}
                                    onClick={() => setConfirming('cancel')}
                                >
                                    Cancel
                                </Button>
                            </>
                        ) : null}
                        {race.resultTimeS === null ? (
                            <Button
                                size="sm"
                                variant="ghost"
                                data-testid={`race-delete-${id}`}
                                onClick={() => setConfirming('delete')}
                            >
                                Delete
                            </Button>
                        ) : null}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
