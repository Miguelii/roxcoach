'use client'

import {
    Area,
    Bar,
    CartesianGrid,
    ComposedChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { formatKg } from '@/_bff/core/utils/formatters.utils'
import type { TopExerciseDTO } from '@/_bff/modules/training/types/progress'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { bucketLabel } from '@/modules/dashboard/progress/progress-utils'
import {
    AXIS_COLOR,
    GRID_COLOR,
    PACE_COLOR,
    REPS_COLOR,
} from '@/modules/dashboard/progress/series-styles'

type Props = {
    exercise: TopExerciseDTO
}

const PADDING_KG = 5

// The heaviest set of every workout of one exercise on its own axis, with a soft fill under the
// line so the climb reads at a glance.
export function ExerciseTrendChart({ exercise }: Props) {
    const reduceMotion = usePrefersReducedMotion()
    const data = exercise.points.map((point) => ({
        label: bucketLabel(point.date, 'week'),
        kg: point.topSetKg,
        reps: point.topSetReps,
    }))
    const maxReps = Math.max(...exercise.points.map((point) => point.topSetReps))
    const values = exercise.points.map((point) => point.topSetKg)
    const low = Math.max(0, Math.floor(Math.min(...values) - PADDING_KG))
    const high = Math.ceil(Math.max(...values) + PADDING_KG)
    const gradientId = `fill-${exercise.key.replaceAll(/[^\w-]/gu, '')}`

    return (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
                data={data}
                accessibilityLayer
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={PACE_COLOR} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={PACE_COLOR} stopOpacity={0.02} />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                    tick={{ fill: AXIS_COLOR, fontSize: 11 }}
                />
                <YAxis
                    domain={[low, high]}
                    width={34}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tick={{ fill: AXIS_COLOR, fontSize: 11 }}
                />
                <YAxis yAxisId="reps" hide domain={[0, maxReps * 3]} />
                <Tooltip
                    contentStyle={{
                        background: 'var(--color-card)',
                        border: '1px solid var(--color-hairline)',
                        borderRadius: 12,
                        fontSize: 12,
                    }}
                    formatter={(value, name) =>
                        name === 'Reps'
                            ? [`${value} reps`, 'Reps']
                            : [formatKg(Number(value)) ?? '-', 'Top set']
                    }
                />
                <Bar
                    yAxisId="reps"
                    dataKey="reps"
                    name="Reps"
                    fill={REPS_COLOR}
                    fillOpacity={0.55}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={14}
                    isAnimationActive={!reduceMotion}
                />
                <Area
                    dataKey="kg"
                    name="Top set"
                    type="monotone"
                    stroke={PACE_COLOR}
                    strokeWidth={2.5}
                    fill={`url(#${gradientId})`}
                    dot={{
                        r: 3.5,
                        fill: PACE_COLOR,
                        stroke: 'var(--color-card)',
                        strokeWidth: 1.5,
                    }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={!reduceMotion}
                />
            </ComposedChart>
        </ResponsiveContainer>
    )
}
