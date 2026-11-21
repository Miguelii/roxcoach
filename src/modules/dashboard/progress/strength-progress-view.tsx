'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useState } from 'react'
import type { StrengthProgressDTO } from '@/_bff/modules/training/types/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChartCard } from '@/modules/dashboard/progress/chart-card'
import { ChartDataTable } from '@/modules/dashboard/progress/chart-data-table'
import { ChartFrame } from '@/modules/dashboard/progress/chart-frame'
import { ExerciseLegendItem } from '@/modules/dashboard/progress/exercise-legend-item'
import { bucketLabel, rangeLabel } from '@/modules/dashboard/progress/progress-utils'
import { SERIES_STYLES } from '@/modules/dashboard/progress/series-styles'
import {
    buildExerciseRows,
    exerciseSummary,
    type ExerciseMode,
} from '@/modules/dashboard/progress/top-exercises-data'
import { formatKg } from '@/_bff/core/utils/formatters.utils'

type Props = {
    data: StrengthProgressDTO
}

// A line needs a few workout dates to say anything; with fewer, the table is shown instead.
const MIN_DATES_TO_DRAW = 3

const MODES: { value: ExerciseMode; label: string; testId: string }[] = [
    { value: 'kg', label: 'Top set', testId: 'metric-top-set' },
    { value: 'percent', label: 'Change', testId: 'metric-change' },
]

// Tabs report any string; only accept a mode this view offers.
const asMode = (value: string) => MODES.find((mode) => mode.value === value)?.value

const TopExercisesChart = dynamic(
    () =>
        import('@/modules/dashboard/progress/top-exercises-chart').then(
            (module) => module.TopExercisesChart
        ),
    { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
)

// The strength mode of the dashboard: the heaviest set of the most used exercises over time.
export function StrengthProgressView({ data }: Props) {
    const [mode, setMode] = useState<ExerciseMode>('kg')
    const [hidden, setHidden] = useState<string[]>([])

    if (data.exercises.length === 0)
        return (
            <p
                data-testid="strength-progress-empty"
                className="rounded-[var(--radius-surface)] border border-ink/10 bg-card p-5 text-sm text-muted-foreground"
            >
                <Link href="/settings" className="underline">
                    Sync Lyfta
                </Link>{' '}
                to see your progress.
            </p>
        )

    const toggle = (key: string) =>
        setHidden((current) =>
            current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
        )

    // Each exercise keeps its own style slot, shown or hidden, so a line never changes color.
    const styled = data.exercises.map((exercise, index) => ({ exercise, index }))
    const visible = styled.filter(({ exercise }) => !hidden.includes(exercise.key))
    const visibleExercises = visible.map(({ exercise }) => exercise)
    const rows = buildExerciseRows(visibleExercises, mode)
    const canDraw = visibleExercises.length > 0 && rows.length >= MIN_DATES_TO_DRAW

    const summaries = data.exercises.flatMap((exercise) => {
        const summary = exerciseSummary(exercise)
        return summary === null ? [] : [`${exercise.name} ${formatKg(summary.latestKg) ?? ''}`]
    })

    return (
        <div data-testid="strength-progress" className="space-y-4">
            <ChartCard
                testId="top-exercises"
                title="Top exercises"
                takeaway="The heaviest set of each workout, for your most used lifts."
                controls={
                    <Tabs
                        value={mode}
                        onValueChange={(value) => {
                            const next = asMode(value)
                            if (next !== undefined) setMode(next)
                        }}
                        className="w-full sm:w-auto"
                    >
                        <TabsList
                            aria-label="Chart values"
                            className="grid h-auto w-full grid-cols-2 sm:w-fit"
                        >
                            {MODES.map((item) => (
                                <TabsTrigger
                                    key={item.value}
                                    value={item.value}
                                    data-testid={item.testId}
                                    className="h-11 sm:h-8 sm:px-4"
                                >
                                    {item.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                }
                footnote={
                    mode === 'percent'
                        ? 'Change compares each lift with its first workout in the range.'
                        : undefined
                }
            >
                <div
                    role="group"
                    aria-label="Exercises shown"
                    className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                >
                    {styled.map(({ exercise, index }) => {
                        const style = SERIES_STYLES[index % SERIES_STYLES.length]
                        return style === undefined ? null : (
                            <ExerciseLegendItem
                                key={exercise.key}
                                exercise={exercise}
                                style={style}
                                mode={mode}
                                shown={!hidden.includes(exercise.key)}
                                onToggle={() => toggle(exercise.key)}
                            />
                        )
                    })}
                </div>
                {canDraw ? (
                    <ChartFrame
                        testId="top-exercises-figure"
                        label={`Heaviest set of each workout over ${rangeLabel(data.range)}: ${summaries.join(', ')}.`}
                    >
                        <TopExercisesChart
                            exercises={visibleExercises}
                            styleIndexes={visible.map(({ index }) => index)}
                            mode={mode}
                        />
                    </ChartFrame>
                ) : null}
                {visibleExercises.length === 0 ? (
                    <p
                        data-testid="top-exercises-all-hidden"
                        className="text-sm text-muted-foreground"
                    >
                        Every exercise is hidden.
                    </p>
                ) : (
                    <ChartDataTable
                        testId="top-exercises-table"
                        caption="Heaviest set of each workout by exercise"
                        columns={['Date', ...visibleExercises.map((exercise) => exercise.name)]}
                        rows={rows.map((row) => [
                            bucketLabel(row.date, 'week'),
                            ...row.values.map((value) =>
                                value === null
                                    ? null
                                    : mode === 'kg'
                                      ? formatKg(value)
                                      : `${value}%`
                            ),
                        ])}
                        defaultOpen={!canDraw}
                    />
                )}
            </ChartCard>
        </div>
    )
}
