import Link from 'next/link'
import { formatVolumeKg, formatCompact } from '@/_bff/core/utils/formatters.utils'
import type { StrengthProgressDTO } from '@/_bff/modules/training/types/progress'
import { BucketChartCard } from '@/modules/dashboard/progress/bucket-chart-card'
import { ExerciseCard } from '@/modules/dashboard/progress/exercise-card'
import { bucketLabel, rangeLabel } from '@/modules/dashboard/progress/progress-utils'
import { FREQUENCY_COLOR, VOLUME_COLOR } from '@/modules/dashboard/progress/series-styles'

type Props = {
    data: StrengthProgressDTO
}

const round1 = (value: number) => Math.round(value * 10) / 10

// The strength mode of the dashboard: how much and how often you lift, then one chart per most
// used exercise, one below the other.
export function StrengthProgressView({ data }: Props) {
    const { buckets, granularity, range } = data
    const totalWorkouts = buckets.reduce((sum, bucket) => sum + bucket.workouts, 0)
    const totalVolume = buckets.reduce((sum, bucket) => sum + bucket.volumeKg, 0)

    if (totalWorkouts === 0 && data.exercises.length === 0)
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

    return (
        <div data-testid="strength-progress" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
                <BucketChartCard
                    testId="volume-chart"
                    title="Training volume"
                    takeaway={`${formatVolumeKg(totalVolume) ?? '-'} lifted over ${rangeLabel(range)}.`}
                    ariaLabel={`Volume lifted per ${granularity}, ${formatVolumeKg(totalVolume) ?? '-'} in total.`}
                    kind="bar"
                    color={VOLUME_COLOR}
                    data={buckets.map((bucket) => ({
                        label: bucketLabel(bucket.start, granularity),
                        value: bucket.volumeKg > 0 ? bucket.volumeKg : null,
                    }))}
                    format={(value) => formatVolumeKg(value) ?? ''}
                    formatAxis={formatCompact}
                    valueName="Volume"
                />
                <BucketChartCard
                    testId="workouts-chart"
                    title="Workouts"
                    takeaway={`${totalWorkouts} workouts, ${round1(totalWorkouts / buckets.length)} per ${granularity}.`}
                    ariaLabel={`Workouts per ${granularity}, ${totalWorkouts} in total.`}
                    kind="bar"
                    color={FREQUENCY_COLOR}
                    data={buckets.map((bucket) => ({
                        label: bucketLabel(bucket.start, granularity),
                        value: bucket.workouts > 0 ? bucket.workouts : null,
                    }))}
                    format={(value) => `${value} ${value === 1 ? 'workout' : 'workouts'}`}
                    formatAxis={(value) => String(value)}
                    valueName="Workouts"
                />
            </div>

            <section aria-label="Top exercises" className="space-y-3">
                <header className="space-y-1">
                    <h2 className="display text-xl">Top exercises</h2>
                    <p className="text-sm text-muted-foreground">
                        The heaviest set of every workout, for your most used lifts.
                    </p>
                </header>
                {data.exercises.length === 0 ? (
                    <p data-testid="top-exercises-empty" className="text-sm text-muted-foreground">
                        No weighted sets in this range.
                    </p>
                ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                        {data.exercises.map((exercise) => (
                            <ExerciseCard key={exercise.key} exercise={exercise} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}
