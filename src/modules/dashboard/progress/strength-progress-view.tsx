'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { StrengthProgressDTO } from '@/_bff/modules/training/types/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BodyWeightCard } from '@/modules/dashboard/progress/body-weight-card'
import { ExerciseCard, type ExerciseMetric } from '@/modules/dashboard/progress/exercise-card'

type Props = {
    data: StrengthProgressDTO
}

const METRICS: { value: ExerciseMetric; label: string; testId: string }[] = [
    { value: 'topSetKg', label: 'Top set', testId: 'metric-top-set' },
    { value: 'estimatedOneRmKg', label: 'Est. 1RM', testId: 'metric-one-rm' },
]

// Tabs report any string; only accept a metric this view offers.
const asMetric = (value: string) => METRICS.find((metric) => metric.value === value)?.value

// The strength mode of the dashboard: the most used exercises, each on its own axis, and body weight.
export function StrengthProgressView({ data }: Props) {
    const [metric, setMetric] = useState<ExerciseMetric>('topSetKg')

    return (
        <div data-testid="strength-progress" className="space-y-4">
            <section aria-label="Top exercises" className="space-y-3">
                <header className="flex flex-wrap items-end justify-between gap-3">
                    <div className="space-y-1">
                        <h2 className="display text-xl">Top exercises</h2>
                        <p className="text-sm text-muted-foreground">
                            Your most used lifts, each on its own scale.
                        </p>
                    </div>
                    <Tabs
                        value={metric}
                        onValueChange={(value) => {
                            const next = asMetric(value)
                            if (next !== undefined) setMetric(next)
                        }}
                        className="w-full sm:w-auto"
                    >
                        <TabsList
                            aria-label="Exercise metric"
                            className="grid h-auto w-full grid-cols-2 sm:w-fit"
                        >
                            {METRICS.map((item) => (
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
                </header>
                {data.exercises.length === 0 ? (
                    <p
                        data-testid="strength-progress-empty"
                        className="rounded-[var(--radius-surface)] border border-ink/10 bg-card p-5 text-sm text-muted-foreground"
                    >
                        <Link href="/settings" className="underline">
                            Sync Lyfta
                        </Link>{' '}
                        to see your progress.
                    </p>
                ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {data.exercises.map((exercise) => (
                            <ExerciseCard key={exercise.key} exercise={exercise} metric={metric} />
                        ))}
                    </div>
                )}
            </section>
            <BodyWeightCard points={data.bodyWeight} />
        </div>
    )
}
