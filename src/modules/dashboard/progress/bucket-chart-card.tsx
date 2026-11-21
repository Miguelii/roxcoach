'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import type { BucketPoint } from '@/modules/dashboard/progress/bucket-chart'
import { ChartCard } from '@/modules/dashboard/progress/chart-card'
import { ChartDataTable } from '@/modules/dashboard/progress/chart-data-table'
import { ChartFrame } from '@/modules/dashboard/progress/chart-frame'

type Props = {
    testId: string
    title: string
    takeaway: string
    // What the chart says, for screen readers.
    ariaLabel: string
    kind: 'bar' | 'line'
    color: string
    data: BucketPoint[]
    format: (value: number) => string
    formatAxis: (value: number) => string
    // Column title of the value in the table, and its name in the tooltip.
    valueName: string
    periodName: 'Week' | 'Month'
}

// Fewer buckets with a value than this and a chart says nothing.
const MIN_POINTS_TO_DRAW = 2

const BucketChart = dynamic(
    () => import('@/modules/dashboard/progress/bucket-chart').then((module) => module.BucketChart),
    { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
)

// One value per week or month as a chart in a card, with the same numbers as a table on request.
export function BucketChartCard({
    testId,
    title,
    takeaway,
    ariaLabel,
    kind,
    color,
    data,
    format,
    formatAxis,
    valueName,
    periodName,
}: Props) {
    const filled = data.filter((point) => point.value !== null).length

    return (
        <ChartCard testId={testId} title={title} takeaway={takeaway}>
            {filled >= MIN_POINTS_TO_DRAW ? (
                <ChartFrame testId={`${testId}-figure`} label={ariaLabel}>
                    <BucketChart
                        kind={kind}
                        data={data}
                        color={color}
                        format={format}
                        formatAxis={formatAxis}
                        name={valueName}
                    />
                </ChartFrame>
            ) : null}
            <ChartDataTable
                testId={`${testId}-table`}
                caption={`${valueName} by ${periodName.toLowerCase()}`}
                columns={[periodName, valueName]}
                rows={data.map((point) => [
                    point.label,
                    point.value === null ? null : format(point.value),
                ])}
                defaultOpen={filled < MIN_POINTS_TO_DRAW}
            />
        </ChartCard>
    )
}
