'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { formatVolumeKg, formatCompact } from '@/_bff/core/utils/formatters.utils'
import type { StrengthProgressDTO } from '@/_bff/modules/training/types/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { BucketChartCard } from '@/modules/dashboard/progress/bucket-chart-card'
import { ChartCard } from '@/modules/dashboard/progress/chart-card'
import { ChartFrameSkeleton } from '@/modules/dashboard/progress/chart-frame'
import { ExerciseCard, ExerciseCardLoading } from '@/modules/dashboard/progress/exercise-card'
import {
    StrengthOverviewCard,
    StrengthOverviewLoading,
} from '@/modules/dashboard/progress/strength-overview-card'
import { ExerciseFilter, TOP_FILTER } from '@/modules/dashboard/progress/exercise-filter'
import {
    bucketLabel,
    bucketRangeLabel,
    rangeLabel,
} from '@/modules/dashboard/progress/progress-utils'
import { FREQUENCY_COLOR, VOLUME_COLOR } from '@/modules/dashboard/progress/series-styles'

type Props = {
    data: StrengthProgressDTO
}

type HeadingProps = {
    filter: ReactNode
}

// How many exercises the filter's first option shows.
const TOP_SHOWN = 4

const round1 = (value: number) => Math.round(value * 10) / 10

const VOLUME_TITLE = 'Training volume'
const WORKOUTS_TITLE = 'Workouts'

function TopExercisesHeading({ filter }: HeadingProps) {
    return (
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
                <h2 className="display text-xl">Top exercises</h2>
                <p className="text-sm text-muted-foreground">
                    The heaviest set of every workout, for your most used lifts.
                </p>
            </div>
            {filter === null ? null : <div className="w-full sm:w-auto">{filter}</div>}
        </header>
    )
}

// The strength mode of the dashboard: how much and how often you lift, then one chart per most
// used exercise, one below the other.
export function StrengthProgressView({ data }: Props) {
    const { buckets, granularity, range } = data
    const [filter, setFilter] = useState(TOP_FILTER)
    const totalWorkouts = buckets.reduce((sum, bucket) => sum + bucket.workouts, 0)
    const totalVolume = buckets.reduce((sum, bucket) => sum + bucket.volumeKg, 0)

    // A chosen exercise that is not in the data anymore (another range) falls back to the top ones.
    const chosen = data.exercises.find((exercise) => exercise.key === filter)
    const shown = chosen === undefined ? data.exercises.slice(0, TOP_SHOWN) : [chosen]

    if (totalWorkouts === 0 && data.exercises.length === 0)
        return (
            <p
                data-testid="strength-progress-empty"
                className="rounded-[var(--radius-surface)] shadow-soft bg-card p-5 text-sm text-muted-foreground"
            >
                <Link href="/settings" className="underline">
                    Sync Lyfta
                </Link>{' '}
                to see your progress.
            </p>
        )

    return (
        <div data-testid="strength-progress" className="space-y-4">
            {data.exercises.length === 0 ? null : (
                <StrengthOverviewCard exercises={data.exercises} />
            )}

            <section aria-label="Top exercises" className="space-y-3">
                <TopExercisesHeading
                    filter={
                        data.exercises.length === 0 ? null : (
                            <ExerciseFilter
                                exercises={data.exercises}
                                value={chosen === undefined ? TOP_FILTER : filter}
                                onChange={setFilter}
                                topCount={TOP_SHOWN}
                            />
                        )
                    }
                />
                {data.exercises.length === 0 ? (
                    <p data-testid="top-exercises-empty" className="text-sm text-muted-foreground">
                        No weighted sets in this range.
                    </p>
                ) : (
                    <div
                        className={
                            shown.length > 1
                                ? 'grid grid-cols-1 gap-3 lg:grid-cols-2'
                                : 'grid grid-cols-1 gap-3'
                        }
                    >
                        {shown.map((exercise) => (
                            <ExerciseCard key={exercise.key} exercise={exercise} />
                        ))}
                    </div>
                )}
            </section>
            <div className="grid grid-cols-1 gap-4">
                <BucketChartCard
                    testId="volume-chart"
                    title={VOLUME_TITLE}
                    takeaway={`${formatVolumeKg(totalVolume) ?? '-'} lifted over ${rangeLabel(range)}.`}
                    ariaLabel={`Volume lifted per ${granularity}, ${formatVolumeKg(totalVolume) ?? '-'} in total.`}
                    kind="bar"
                    color={VOLUME_COLOR}
                    data={buckets.map((bucket) => ({
                        label: bucketLabel(bucket.start, granularity),
                        range: bucketRangeLabel(bucket.start, granularity),
                        value: bucket.volumeKg > 0 ? bucket.volumeKg : null,
                    }))}
                    format={(value) => formatVolumeKg(value) ?? ''}
                    formatAxis={formatCompact}
                    valueName="Volume"
                />
                <BucketChartCard
                    testId="workouts-chart"
                    title={WORKOUTS_TITLE}
                    takeaway={`${totalWorkouts} workouts, ${round1(totalWorkouts / buckets.length)} per ${granularity}.`}
                    ariaLabel={`Workouts per ${granularity}, ${totalWorkouts} in total.`}
                    kind="bar"
                    color={FREQUENCY_COLOR}
                    data={buckets.map((bucket) => ({
                        label: bucketLabel(bucket.start, granularity),
                        range: bucketRangeLabel(bucket.start, granularity),
                        value: bucket.workouts > 0 ? bucket.workouts : null,
                    }))}
                    format={(value) => `${value} ${value === 1 ? 'workout' : 'workouts'}`}
                    formatAxis={String}
                    valueName="Workouts"
                />
            </div>
        </div>
    )
}

/** The strength layout with its titles and card frames while the lifts load. */
export function StrengthProgressLoading() {
    return (
        <div data-testid="strength-progress-loading" aria-busy className="space-y-4">
            <StrengthOverviewLoading />
            <section aria-label="Top exercises" className="space-y-3">
                <TopExercisesHeading filter={<Skeleton className="h-9 w-full sm:w-48" />} />
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <ExerciseCardLoading />
                    <ExerciseCardLoading />
                </div>
            </section>
            <div className="grid grid-cols-1 gap-4">
                <ChartCard testId="volume-chart" title={VOLUME_TITLE} takeaway={null}>
                    <ChartFrameSkeleton />
                </ChartCard>
                <ChartCard testId="workouts-chart" title={WORKOUTS_TITLE} takeaway={null}>
                    <ChartFrameSkeleton />
                </ChartCard>
            </div>
        </div>
    )
}
