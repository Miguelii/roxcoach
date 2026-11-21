'use client'

import dynamic from 'next/dynamic'
import { formatKg } from '@/_bff/core/utils/formatters.utils'
import type { TopExerciseDTO } from '@/_bff/modules/training/types/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ChangeBadge } from '@/modules/dashboard/progress/change-badge'
import { ChartDataTable } from '@/modules/dashboard/progress/chart-data-table'
import { bucketLabel } from '@/modules/dashboard/progress/progress-utils'
import { PACE_COLOR } from '@/modules/dashboard/progress/series-styles'

export type ExerciseMetric = 'topSetKg' | 'estimatedOneRmKg'

type Props = {
    exercise: TopExerciseDTO
    metric: ExerciseMetric
}

// Fewer points than this and a line says nothing: the latest value and the table are shown.
const MIN_POINTS_TO_DRAW = 3

const KgTrendChart = dynamic(
    () =>
        import('@/modules/dashboard/progress/kg-trend-chart').then((module) => module.KgTrendChart),
    { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
)

const METRIC_LABEL: Record<ExerciseMetric, string> = {
    topSetKg: 'Top set',
    estimatedOneRmKg: 'Est. 1RM',
}

// One exercise on its own axis: the latest value, the change over the range, a small line.
export function ExerciseCard({ exercise, metric }: Props) {
    const points = exercise.points.flatMap((point) => {
        const value = point[metric]
        return value === null ? [] : [{ date: point.date, value }]
    })
    const first = points[0]
    const last = points.at(-1)
    const delta =
        first === undefined || last === undefined || points.length < 2
            ? null
            : last.value - first.value

    return (
        <section
            data-testid="exercise-card"
            aria-label={exercise.name}
            className="space-y-3 rounded-[var(--radius-surface)] border border-ink/10 bg-card p-4"
        >
            <header className="space-y-1">
                <h3 className="display truncate text-lg">{exercise.name}</h3>
                <p className="text-xs text-muted-foreground">
                    {METRIC_LABEL[metric]}, {exercise.workouts} workouts
                </p>
            </header>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p data-testid="exercise-latest" className="display text-3xl tabular-nums">
                    {formatKg(last?.value) ?? '-'}
                </p>
                <ChangeBadge
                    delta={delta}
                    format={(absolute) => formatKg(absolute) ?? ''}
                    testId="exercise-change"
                />
            </div>
            {points.length >= MIN_POINTS_TO_DRAW ? (
                <div
                    role="img"
                    data-testid="exercise-chart-figure"
                    aria-label={`${exercise.name} ${METRIC_LABEL[metric].toLowerCase()}, from ${formatKg(first?.value) ?? '-'} to ${formatKg(last?.value) ?? '-'}.`}
                    className="h-36 w-full"
                >
                    <KgTrendChart points={points} color={PACE_COLOR} />
                </div>
            ) : null}
            <ChartDataTable
                testId={`exercise-table-${exercise.key}`}
                caption={`${exercise.name} ${METRIC_LABEL[metric].toLowerCase()} by workout`}
                columns={['Date', METRIC_LABEL[metric]]}
                rows={points.map((point) => [
                    bucketLabel(point.date, 'week'),
                    formatKg(point.value),
                ])}
                defaultOpen={points.length < MIN_POINTS_TO_DRAW}
            />
        </section>
    )
}
