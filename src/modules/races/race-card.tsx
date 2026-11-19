'use client'

import { IconDots, IconFlag, IconMapPin } from '@tabler/icons-react'
import { toast } from 'sonner'
import { formatClock, formatPace } from '@/_bff/core/utils/formatters.utils'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { daysBetween, shortDateLabel } from '@/modules/calendar/date-utils'
import { TODAY } from '@/modules/mock/data'
import type { MockRace } from '@/modules/mock/types'

type Props = {
    race: MockRace
}

const PRIORITY_COPY = {
    A: 'Target race',
    B: 'Tune-up',
    C: 'Training race',
} as const

export function RaceCard({ race }: Props) {
    const days = daysBetween(TODAY, race.date)
    const completed = race.status === 'completed'
    const delta = race.resultS == null ? null : race.resultS - race.targetS
    const requiredPace = race.distanceM ? formatPace(race.distanceM / race.targetS) : null

    return (
        <article
            data-tone={completed ? 'slate' : 'amber'}
            className="flex flex-col gap-4 rounded-[var(--radius-surface)] border border-ink/10 bg-card p-5"
        >
            <div className="flex items-start gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-tone text-tone-ink">
                    <IconFlag className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold">{race.name}</h3>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <IconMapPin className="size-3" />
                        {race.location}, {shortDateLabel(race.date)}
                        {race.division && `, ${race.division}`}
                    </p>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon" aria-label="Race actions" />}
                    >
                        <IconDots />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => toast('Mockup: edit race')}>
                            Edit
                        </DropdownMenuItem>
                        {!completed && (
                            <DropdownMenuItem onClick={() => toast('Mockup: race completed')}>
                                Record result
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => toast('Mockup: race cancelled')}>
                            Cancel race
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="flex items-end justify-between gap-4">
                {completed ? (
                    <div>
                        <p className="eyebrow text-muted-foreground">Result</p>
                        <p className="display text-4xl">{formatClock(race.resultS)}</p>
                    </div>
                ) : (
                    <div>
                        <p className="eyebrow text-muted-foreground">Days to go</p>
                        <p className="display text-4xl">{days}</p>
                    </div>
                )}
                <div className="text-right">
                    <p className="eyebrow text-muted-foreground">Goal</p>
                    <p className="font-mono text-lg font-semibold">{formatClock(race.targetS)}</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-tone-soft px-2.5 py-1 font-medium text-tone-deep">
                    {race.priority}: {PRIORITY_COPY[race.priority]}
                </span>
                {requiredPace && (
                    <span className="rounded-full border border-hairline-strong px-2.5 py-1 text-muted-foreground">
                        Needs {requiredPace}
                    </span>
                )}
                {delta != null && (
                    <span className="rounded-full border border-hairline-strong px-2.5 py-1 text-muted-foreground">
                        {delta > 0
                            ? `${formatClock(delta)} slower than goal`
                            : `${formatClock(-delta)} faster than goal`}
                    </span>
                )}
            </div>
        </article>
    )
}
