import {
    IconArrowsExchange,
    IconMinus,
    IconTrendingDown,
    IconTrendingUp,
} from '@tabler/icons-react'
import { formatKg } from '@/_bff/core/utils/formatters.utils'
import { shortDateLabel } from '@/modules/calendar/date-utils'
import type { ExerciseInsights } from '@/modules/dashboard/progress/progress-utils'

type Props = {
    insights: ExerciseInsights
}

const VERDICTS = {
    progressing: { label: 'Progressing', tone: 'green', Icon: IconTrendingUp },
    steady: { label: 'Holding steady', tone: 'slate', Icon: IconMinus },
    declining: { label: 'Slipping', tone: 'red', Icon: IconTrendingDown },
} as const

const signOf = (value: number) => (value > 0 ? '+' : value < 0 ? '-' : '')

const signedKg = (value: number) =>
    value === 0 ? 'no change' : `${signOf(value)}${formatKg(Math.abs(value))}`

const signedReps = (value: number) =>
    value === 0 ? 'no change' : `${signOf(value)}${Math.abs(value)} reps`

function HeaviestLabel({ workoutsAgo }: { workoutsAgo: number }) {
    if (workoutsAgo === 0)
        return (
            <>
                Your heaviest top set is the <strong className="font-semibold">latest</strong>{' '}
                workout.
            </>
        )
    return (
        <>
            Your heaviest top set was <strong className="font-semibold">{workoutsAgo}</strong>{' '}
            {workoutsAgo === 1 ? 'workout' : 'workouts'} ago.
        </>
    )
}

const verdictOf = (insights: ExerciseInsights) =>
    insights.verdict === 'mixed'
        ? {
              label: insights.loadDeltaKg > 0 ? 'More weight, fewer reps' : 'Lighter, more reps',
              tone: 'blue',
              Icon: IconArrowsExchange,
          }
        : VERDICTS[insights.verdict]

export function ExerciseProgressInsights({ insights }: Props) {
    const verdict = verdictOf(insights)
    const stats = [
        { id: 'load', label: 'Weight', value: signedKg(insights.loadDeltaKg) },
        { id: 'reps', label: 'Reps', value: signedReps(insights.repsDelta) },
    ]

    return (
        <div
            data-testid="exercise-insights"
            className="space-y-3 rounded-[var(--radius-surface-inner)] bg-paper p-3"
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                    data-testid="exercise-verdict"
                    data-tone={verdict.tone}
                    className="inline-flex items-center gap-1.5 rounded-full bg-tone-soft px-2.5 py-1 text-xs font-medium text-tone-deep"
                >
                    <verdict.Icon className="size-3.5" aria-hidden="true" />
                    {verdict.label}
                </span>
                <span className="text-xs text-muted-foreground">
                    Since {shortDateLabel(insights.firstDate)}
                </span>
            </div>

            <dl className="grid grid-cols-2 gap-2">
                {stats.map((stat) => (
                    <div key={stat.id} className="min-w-0">
                        <dt className="eyebrow text-muted-foreground">{stat.label}</dt>
                        <dd
                            data-testid={`exercise-insight-${stat.id}`}
                            className="mt-0.5 font-mono text-sm tabular-nums"
                        >
                            {stat.value}
                        </dd>
                    </div>
                ))}
            </dl>

            <p data-testid="exercise-insight-best" className="text-xs text-muted-foreground">
                <HeaviestLabel workoutsAgo={insights.heaviestWorkoutsAgo} />
            </p>
        </div>
    )
}
