'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { IconBarbell } from '@tabler/icons-react'
import { formatKg } from '@/_bff/core/utils/formatters.utils'
import type { TopExerciseDTO } from '@/_bff/modules/training/types/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ChangeBadge } from '@/modules/dashboard/progress/change-badge'

type Props = {
    exercise: TopExerciseDTO
}

const ExerciseTrendChart = dynamic(
    () =>
        import('@/modules/dashboard/progress/exercise-trend-chart').then(
            (module) => module.ExerciseTrendChart
        ),
    { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
)

const chartLabel = (exercise: TopExerciseDTO) => {
    const first = exercise.points[0]
    const last = exercise.points.at(-1)
    if (first === undefined || last === undefined) return `${exercise.name} top set.`
    if (exercise.points.length === 1)
        return `${exercise.name} top set, ${formatKg(last.topSetKg) ?? '-'} in 1 workout.`
    return `${exercise.name} top set, from ${formatKg(first.topSetKg) ?? '-'} to ${formatKg(last.topSetKg) ?? '-'} over ${exercise.points.length} workouts.`
}

// One exercise: its picture, the latest top set, how far it climbed, and a chart of the heaviest
// set of every workout on its own axis.
export function ExerciseCard({ exercise }: Props) {
    const first = exercise.points[0]
    const last = exercise.points.at(-1)
    const best = Math.max(...exercise.points.map((point) => point.topSetKg))
    const delta =
        first === undefined || last === undefined || exercise.points.length < 2
            ? null
            : last.topSetKg - first.topSetKg

    return (
        <section
            data-testid="exercise-card"
            aria-label={exercise.name}
            className="min-w-0 space-y-4 rounded-[var(--radius-surface)] border border-ink/10 bg-card p-4 md:p-5"
        >
            <header className="flex items-center gap-3">
                <span className="relative size-14 shrink-0 overflow-hidden rounded-[var(--radius-surface-inner)] border border-hairline bg-background">
                    {exercise.imageUrl === null ? (
                        <IconBarbell
                            data-testid={`exercise-image-placeholder-${exercise.key}`}
                            aria-hidden="true"
                            className="absolute inset-0 m-auto size-7 text-muted-foreground"
                        />
                    ) : (
                        <Image
                            data-testid={`exercise-image-${exercise.key}`}
                            src={exercise.imageUrl}
                            alt={`${exercise.name} demonstration`}
                            fill
                            sizes="56px"
                            className="object-contain p-1"
                        />
                    )}
                </span>
                <div className="min-w-0 space-y-0.5">
                    <h3 className="display truncate text-xl">{exercise.name}</h3>
                    <p className="text-xs text-muted-foreground">{exercise.workouts} workouts</p>
                </div>
            </header>

            <div className="flex items-end justify-between gap-3">
                <div className="space-y-1">
                    <p className="eyebrow text-muted-foreground">Latest top set</p>
                    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span
                            data-testid="exercise-latest"
                            className="display text-4xl tabular-nums"
                        >
                            {formatKg(last?.topSetKg) ?? '-'}
                        </span>
                        {delta !== null && delta !== 0 && (
                            <ChangeBadge
                                delta={delta}
                                format={(absolute) => formatKg(absolute) ?? ''}
                                testId="exercise-change"
                            />
                        )}
                    </p>
                </div>
                <div className="space-y-1 text-right">
                    <p className="eyebrow text-muted-foreground">Best</p>
                    <p data-testid="exercise-best" className="text-lg font-medium tabular-nums">
                        {formatKg(best)}
                    </p>
                </div>
            </div>

            <div
                role="img"
                data-testid="exercise-chart-figure"
                aria-label={chartLabel(exercise)}
                className="h-44 w-full md:h-52"
            >
                <ExerciseTrendChart exercise={exercise} />
            </div>
        </section>
    )
}
