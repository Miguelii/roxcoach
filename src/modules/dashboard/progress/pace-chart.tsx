'use client'

import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { formatClock, formatPaceSeconds } from '@/_bff/core/utils/formatters.utils'
import type { RunBucketDTO, RunGoalDTO } from '@/_bff/modules/training/types/progress'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { bucketLabel, bucketRangeLabel } from '@/modules/dashboard/progress/progress-utils'
import {
    AXIS_COLOR,
    GOAL_COLOR,
    GRID_COLOR,
    PACE_COLOR,
} from '@/modules/dashboard/progress/series-styles'

type Props = {
    buckets: RunBucketDTO[]
    goal: RunGoalDTO | null
    granularity: 'week' | 'month'
}

const PADDING_S = 10
const STEP_S = 5

// The axis is reversed: a lower number is a faster pace, so faster sits higher.
export function PaceChart({ buckets, goal, granularity }: Props) {
    const reduceMotion = usePrefersReducedMotion()
    const data = buckets.map((bucket) => ({
        label: bucketLabel(bucket.start, granularity),
        range: bucketRangeLabel(bucket.start, granularity),
        pace: bucket.paceSecPerKm,
    }))
    const values = [
        ...buckets.flatMap((b) => b.paceSecPerKm ?? []),
        ...(goal ? [goal.paceSecPerKm] : []),
    ]
    const low = Math.floor((Math.min(...values) - PADDING_S) / STEP_S) * STEP_S
    const high = Math.ceil((Math.max(...values) + PADDING_S) / STEP_S) * STEP_S

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart
                data={data}
                accessibilityLayer
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
            >
                <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                    tick={{ fill: AXIS_COLOR, fontSize: 12 }}
                />
                <YAxis
                    reversed
                    domain={[low, high]}
                    width={44}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) => formatClock(value) ?? ''}
                    tick={{ fill: AXIS_COLOR, fontSize: 12 }}
                />
                <Tooltip
                    contentStyle={{
                        background: 'var(--color-card)',
                        border: '1px solid var(--color-hairline)',
                        borderRadius: 12,
                        fontSize: 12,
                    }}
                    labelFormatter={(label, payload) => payload[0]?.payload.range ?? label}
                    formatter={(value) => [formatPaceSeconds(Number(value)) ?? '-', 'Pace']}
                />
                {goal === null ? null : (
                    <ReferenceLine
                        y={goal.paceSecPerKm}
                        stroke={GOAL_COLOR}
                        strokeDasharray="6 4"
                        strokeWidth={2}
                        label={{
                            value: `Goal ${formatPaceSeconds(goal.paceSecPerKm) ?? ''}`,
                            position: 'insideBottomRight',
                            fill: GOAL_COLOR,
                            fontSize: 12,
                        }}
                    />
                )}
                <Line
                    dataKey="pace"
                    stroke={PACE_COLOR}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: PACE_COLOR, stroke: PACE_COLOR }}
                    activeDot={{ r: 5 }}
                    connectNulls
                    isAnimationActive={!reduceMotion}
                />
            </LineChart>
        </ResponsiveContainer>
    )
}
