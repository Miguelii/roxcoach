import { IconMinus, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react'
import { formatKg } from '@/_bff/core/utils/formatters.utils'
import { InfoTip } from '@/components/ui/info-tip'
import { E1RM_HINT } from '@/lib/constants'
import { shortDateLabel } from '@/modules/calendar/date-utils'
import type { ExerciseInsights } from '@/modules/dashboard/progress/progress-utils'

type Props = {
    insights: ExerciseInsights
}

const VERDICTS = {
    progressing: { label: 'Progressing', tone: 'green', Icon: IconTrendingUp },
    steady: { label: 'Holding steady', tone: 'slate', Icon: IconMinus },
    declining: { label: 'Slipping', tone: 'tangerine', Icon: IconTrendingDown },
} as const

const signOf = (value: number) => (value > 0 ? '+' : value < 0 ? '-' : '')

const signedKg = (value: number) =>
    value === 0 ? 'no change' : `${signOf(value)}${formatKg(Math.abs(value))}`

const signedReps = (value: number) =>
    value === 0 ? 'no change' : `${signOf(value)}${Math.abs(value)} reps`

const bestLabel = (workoutsAgo: number) =>
    workoutsAgo === 0
        ? 'Your best estimated 1RM is the latest workout.'
        : `Your best estimated 1RM was ${workoutsAgo} ${workoutsAgo === 1 ? 'workout' : 'workouts'} ago.`

export function ExerciseProgressInsights({ insights }: Props) {
    const verdict = insights.verdict === null ? null : VERDICTS[insights.verdict]
    const stats = [
        { id: 'load', label: 'Load', value: signedKg(insights.loadDeltaKg) },
        { id: 'reps', label: 'Reps', value: signedReps(insights.repsDelta) },
        ...(insights.e1rmDeltaKg === null
            ? []
            : [
                  {
                      id: 'e1rm',
                      label: 'Est. 1RM',
                      value: signedKg(Number(insights.e1rmDeltaKg.toFixed(1))),
                      tip: E1RM_HINT,
                  },
              ]),
    ]

    return (
        <div
            data-testid="exercise-insights"
            className="space-y-3 rounded-[var(--radius-surface-inner)] bg-muted p-3"
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {verdict !== null && (
                    <span
                        data-testid="exercise-verdict"
                        data-tone={verdict.tone}
                        className="inline-flex items-center gap-1.5 rounded-full bg-tone-soft px-2.5 py-1 text-xs font-medium text-tone-deep"
                    >
                        <verdict.Icon className="size-3.5" aria-hidden="true" />
                        {verdict.label}
                    </span>
                )}
                <span className="text-xs text-muted-foreground">
                    Since {shortDateLabel(insights.firstDate)}
                </span>
            </div>

            <dl className="grid grid-cols-3 gap-2">
                {stats.map((stat) => (
                    <div key={stat.id} className="min-w-0">
                        <dt className="eyebrow flex items-center gap-1.5 text-muted-foreground">
                            {stat.label}
                            {stat.tip !== undefined && (
                                <InfoTip
                                    label={stat.label}
                                    testId={`exercise-insight-${stat.id}-info`}
                                >
                                    {stat.tip}
                                </InfoTip>
                            )}
                        </dt>
                        <dd
                            data-testid={`exercise-insight-${stat.id}`}
                            className="mt-0.5 font-mono text-sm tabular-nums"
                        >
                            {stat.value}
                        </dd>
                    </div>
                ))}
            </dl>

            {insights.bestWorkoutsAgo !== null && (
                <p data-testid="exercise-insight-best" className="text-xs text-muted-foreground">
                    {bestLabel(insights.bestWorkoutsAgo)}
                </p>
            )}
        </div>
    )
}
