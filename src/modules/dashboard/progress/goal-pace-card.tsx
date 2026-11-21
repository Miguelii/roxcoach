import Link from 'next/link'
import { IconTargetArrow } from '@tabler/icons-react'
import { formatClock, formatPaceSeconds } from '@/_bff/core/utils/formatters.utils'
import type { RunProgressDTO } from '@/_bff/modules/training/types/progress'
import { ChangeBadge } from '@/modules/dashboard/progress/change-badge'
import { daysLeftLabel } from '@/modules/dashboard/progress/progress-utils'

type Props = {
    goal: RunProgressDTO['goal']
    // Recent pace minus the goal pace: positive means slower.
    deltaSecPerKm: number | null
}

const deltaText = (delta: number) => {
    if (delta > 0) return 'slower than goal'
    if (delta < 0) return 'faster than goal'
    return 'on goal pace'
}

// The race goal as a pace, and where the recent pace sits against it.
export function GoalPaceCard({ goal, deltaSecPerKm }: Props) {
    return (
        <section
            data-testid="goal-pace"
            aria-label="Goal pace"
            className="flex items-center gap-4 rounded-[var(--radius-surface)] border border-ink/10 bg-card p-4"
        >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tangerine text-on-brand">
                <IconTargetArrow className="size-6" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
                <p className="eyebrow text-muted-foreground">Goal pace</p>
                {goal === null ? (
                    <Link data-testid="goal-pace-empty" href="/races" className="text-sm underline">
                        Add a running race to see your goal pace
                    </Link>
                ) : (
                    <>
                        <p data-testid="goal-pace-value" className="display text-3xl tabular-nums">
                            {formatPaceSeconds(goal.paceSecPerKm)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                            {goal.name}, {daysLeftLabel(goal.daysLeft)}
                        </p>
                    </>
                )}
            </div>
            {goal !== null && deltaSecPerKm !== null ? (
                <div className="shrink-0 space-y-0.5 text-right">
                    <ChangeBadge
                        delta={deltaSecPerKm}
                        format={(absolute) => `${formatClock(absolute)} /km`}
                        testId="goal-pace-delta"
                    />
                    <p data-testid="goal-pace-delta-text" className="text-xs text-muted-foreground">
                        {deltaText(deltaSecPerKm)}
                    </p>
                </div>
            ) : null}
        </section>
    )
}
