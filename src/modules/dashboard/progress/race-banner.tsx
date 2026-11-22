import Link from 'next/link'
import { IconArrowUpRight, IconFlag } from '@tabler/icons-react'
import { formatClock, formatPaceSeconds } from '@/_bff/core/utils/formatters.utils'
import type { RunReadinessDTO } from '@/_bff/modules/training/types/progress'
import { formatDaysToGo, formatRaceDate, PRIORITY_LABELS } from '@/modules/races/utils'

type Props = {
    readiness: RunReadinessDTO
}

type Stat = { id: string; label: string; value: string }

// `priority` travels as a plain string in the payload, so look it up by key.
const priorityLabel = (priority: string) =>
    Object.entries(PRIORITY_LABELS).find(([key]) => key === priority)?.[1] ?? priority

// The next race: days to go and what it asks for. A bezel (outer tray, inner plate) around a
// tinted core, with the arrow in its own circle that drifts on hover.
export function RaceBanner({ readiness }: Props) {
    const { race } = readiness
    const stats: Stat[] = [
        { id: 'goal', label: 'Goal', value: formatClock(race.targetTimeS) ?? '-' },
        { id: 'pace', label: 'Race pace', value: formatPaceSeconds(race.racePaceSPerKm) ?? '-' },
    ]

    return (
        <Link
            href="/races"
            data-testid="race-banner"
            data-tone="amber"
            className="group block transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-700 motion-reduce:transition-none shadow-soft"
        >
            <div className="flex flex-col gap-5 rounded-[var(--radius-surface)] bg-tone-soft p-5 text-tone-deep md:flex-row md:items-center md:gap-8 md:p-6">
                <div className="space-y-2">
                    <p className="eyebrow flex items-center gap-1.5 opacity-80">
                        <IconFlag className="size-3.5" aria-hidden="true" /> Next race
                    </p>
                    <p data-testid="race-banner-days" className="display text-4xl md:text-5xl">
                        {formatDaysToGo(race.daysLeft)}
                    </p>
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                    <div className="space-y-1">
                        <p
                            data-testid="race-banner-name"
                            className="truncate text-lg font-semibold"
                        >
                            {race.name}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-2 font-mono text-xs opacity-80">
                            <span>{formatRaceDate(race.raceDate)}</span>
                            <span aria-hidden="true">/</span>
                            <span data-testid="race-banner-priority">
                                {race.priority}: {priorityLabel(race.priority)}
                            </span>
                        </p>
                    </div>
                    <dl className="flex gap-6">
                        {stats.map((stat) => (
                            <div key={stat.id} className="space-y-0.5">
                                <dt className="eyebrow opacity-70">{stat.label}</dt>
                                <dd
                                    data-testid={`race-banner-${stat.id}`}
                                    className="display text-2xl tabular-nums"
                                >
                                    {stat.value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>

                <span
                    aria-hidden="true"
                    className="hidden size-11 shrink-0 items-center justify-center rounded-full bg-tone-deep/10 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-px group-hover:translate-x-1 group-hover:scale-105 motion-reduce:transition-none md:flex"
                >
                    <IconArrowUpRight className="size-5" />
                </span>
            </div>
        </Link>
    )
}
