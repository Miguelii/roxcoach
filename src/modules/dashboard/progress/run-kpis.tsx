import Link from 'next/link'
import { formatClock, formatPaceSeconds } from '@/_bff/core/utils/formatters.utils'
import type { RunProgressDTO } from '@/_bff/modules/training/types/progress'
import { ChangeBadge } from '@/modules/dashboard/progress/change-badge'
import { daysLeftLabel } from '@/modules/dashboard/progress/progress-utils'

type Props = {
    kpis: RunProgressDTO['kpis']
    goal: RunProgressDTO['goal']
}

type TileProps = {
    id: string
    label: string
    value: string
    children?: React.ReactNode
}

function Tile({ id, label, value, children }: TileProps) {
    return (
        <div
            data-testid={`kpi-${id}`}
            className="rounded-[var(--radius-surface-inner)] border border-ink/10 bg-card p-4"
        >
            <p className="eyebrow text-muted-foreground">{label}</p>
            <p data-testid={`kpi-${id}-value`} className="display mt-1 text-3xl tabular-nums">
                {value}
            </p>
            <div className="mt-2 min-h-5 text-xs text-muted-foreground">{children}</div>
        </div>
    )
}

const deltaText = (delta: number) => {
    if (delta > 0) return 'slower than goal'
    if (delta < 0) return 'faster than goal'
    return 'on goal pace'
}

// Pace, distance and run count of the range, and where the recent pace sits against the goal.
export function RunKpis({ kpis, goal }: Props) {
    const delta = kpis.goalDeltaSecPerKm

    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
                id="avg-pace"
                label="Average pace"
                value={formatPaceSeconds(kpis.avgPaceSecPerKm) ?? '-'}
            >
                over the range
            </Tile>
            <Tile id="distance" label="Distance" value={`${kpis.distanceKm.toFixed(1)} km`}>
                over the range
            </Tile>
            <Tile id="runs" label="Runs" value={String(kpis.runs)}>
                over the range
            </Tile>
            <Tile id="goal" label="Goal pace" value={formatPaceSeconds(goal?.paceSecPerKm) ?? '-'}>
                {goal === null ? (
                    <Link data-testid="kpi-goal-empty" href="/races" className="underline">
                        Add a running race to see your goal pace
                    </Link>
                ) : (
                    <span className="flex flex-col gap-1">
                        <span>
                            {goal.name}, {daysLeftLabel(goal.daysLeft)}
                        </span>
                        {delta === null ? null : (
                            <span className="flex flex-wrap items-center gap-1 text-foreground">
                                <ChangeBadge
                                    delta={delta}
                                    format={(absolute) => `${formatClock(absolute)} /km`}
                                    testId="kpi-goal-delta"
                                />
                                <span data-testid="kpi-goal-delta-text">{deltaText(delta)}</span>
                            </span>
                        )}
                    </span>
                )}
            </Tile>
        </div>
    )
}
