'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import type { BucketPoint } from '@/modules/dashboard/progress/bucket-chart'
import { ChartCard } from '@/modules/dashboard/progress/chart-card'
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
    // What the value is called in the tooltip.
    valueName: string
}

const BucketChart = dynamic(
    () => import('@/modules/dashboard/progress/bucket-chart').then((module) => module.BucketChart),
    { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
)

// One value per week or month as a chart in a card.
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
}: Props) {
    return (
        <ChartCard testId={testId} title={title} takeaway={takeaway}>
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
        </ChartCard>
    )
}
