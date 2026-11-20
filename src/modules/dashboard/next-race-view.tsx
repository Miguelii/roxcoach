import Link from 'next/link'
import { IconArrowRight, IconFlag } from '@tabler/icons-react'
import { formatClock } from '@/_bff/core/utils/formatters.utils'
import type { RaceDTO } from '@/_bff/modules/races/types'
import { daysUntil, formatDaysToGo, formatRaceDate, PRIORITY_LABELS } from '@/modules/races/utils'

type Props = {
    race: RaceDTO | null
    today: string
}

/** The next upcoming race with days to go and goal; renders nothing without one. */
export function NextRaceView({ race, today }: Props) {
    if (race === null) return null

    return (
        <Link
            href="/races"
            data-testid="next-race"
            data-tone="amber"
            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius-surface-inner)] bg-tone-soft p-4 text-tone-deep transition hover:brightness-95"
        >
            <IconFlag className="size-5 shrink-0" aria-label="Next race" />
            <div className="min-w-0">
                <p data-testid="next-race-name" className="truncate text-base font-semibold">
                    {race.name}
                </p>
                <p data-testid="next-race-date" className="font-mono text-xs">
                    {formatRaceDate(race.raceDate)}
                </p>
            </div>
            <p data-testid="next-race-days" className="display text-2xl">
                {formatDaysToGo(daysUntil(today, race.raceDate))}
            </p>
            <p data-testid="next-race-goal" className="font-mono text-xs">
                Goal {formatClock(race.targetTimeS)}
            </p>
            <p data-testid="next-race-priority" className="text-xs font-semibold uppercase">
                {race.priority}: {PRIORITY_LABELS[race.priority]}
            </p>
            <IconArrowRight className="ml-auto size-4" />
        </Link>
    )
}
