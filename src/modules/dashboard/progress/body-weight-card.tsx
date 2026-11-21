'use client'

import dynamic from 'next/dynamic'
import { formatKg } from '@/_bff/core/utils/formatters.utils'
import type { BodyWeightPointDTO } from '@/_bff/modules/training/types/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ChangeBadge } from '@/modules/dashboard/progress/change-badge'
import { ChartCard } from '@/modules/dashboard/progress/chart-card'
import { ChartDataTable } from '@/modules/dashboard/progress/chart-data-table'
import { bucketLabel } from '@/modules/dashboard/progress/progress-utils'

type Props = {
    points: BodyWeightPointDTO[]
}

const MIN_POINTS_TO_DRAW = 3
const BODY_WEIGHT_COLOR = 'var(--color-slate-deep)'

const KgTrendChart = dynamic(
    () =>
        import('@/modules/dashboard/progress/kg-trend-chart').then((module) => module.KgTrendChart),
    { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
)

// Body weight as logged with each Lyfta workout.
export function BodyWeightCard({ points }: Props) {
    const first = points[0]
    const last = points.at(-1)

    if (first === undefined || last === undefined)
        return (
            <ChartCard
                testId="body-weight-card"
                title="Body weight"
                takeaway="No body weight logged yet."
            >
                <p data-testid="body-weight-empty" className="text-sm text-muted-foreground">
                    Log your body weight in Lyfta and sync to see it here.
                </p>
            </ChartCard>
        )

    const delta = points.length < 2 ? null : last.kg - first.kg

    return (
        <ChartCard
            testId="body-weight-card"
            title="Body weight"
            takeaway={`Latest ${formatKg(last.kg) ?? '-'}.`}
            controls={
                <div className="flex items-baseline gap-3">
                    <p data-testid="body-weight-latest" className="display text-3xl tabular-nums">
                        {formatKg(last.kg)}
                    </p>
                    <ChangeBadge
                        delta={delta}
                        format={(absolute) => formatKg(absolute) ?? ''}
                        testId="body-weight-change"
                    />
                </div>
            }
        >
            {points.length >= MIN_POINTS_TO_DRAW ? (
                <div
                    role="img"
                    data-testid="body-weight-figure"
                    aria-label={`Body weight from ${formatKg(first.kg) ?? '-'} to ${formatKg(last.kg) ?? '-'}.`}
                    className="h-60 w-full md:h-72"
                >
                    <KgTrendChart
                        points={points.map((point) => ({ date: point.date, value: point.kg }))}
                        color={BODY_WEIGHT_COLOR}
                    />
                </div>
            ) : null}
            <ChartDataTable
                testId="body-weight-table"
                caption="Body weight by workout"
                columns={['Date', 'Weight']}
                rows={points.map((point) => [bucketLabel(point.date, 'week'), formatKg(point.kg)])}
                defaultOpen={points.length < MIN_POINTS_TO_DRAW}
            />
        </ChartCard>
    )
}
