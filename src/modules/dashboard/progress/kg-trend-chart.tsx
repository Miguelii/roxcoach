'use client'

import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { formatKg } from '@/_bff/core/utils/formatters.utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { bucketLabel } from '@/modules/dashboard/progress/progress-utils'
import { AXIS_COLOR, GRID_COLOR } from '@/modules/dashboard/progress/series-styles'

type Props = {
    points: { date: string; value: number }[]
    color: string
}

const PADDING_KG = 2

// A small line of kilograms over dates with its own Y axis, used per exercise and for body weight.
export function KgTrendChart({ points, color }: Props) {
    const reduceMotion = usePrefersReducedMotion()
    const data = points.map((point) => ({
        label: bucketLabel(point.date, 'week'),
        value: point.value,
    }))
    const values = points.map((point) => point.value)
    const low = Math.floor(Math.min(...values) - PADDING_KG)
    const high = Math.ceil(Math.max(...values) + PADDING_KG)

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart
                data={data}
                accessibilityLayer
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
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
                    width={36}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tick={{ fill: AXIS_COLOR, fontSize: 11 }}
                />
                <Tooltip
                    contentStyle={{
                        background: 'var(--color-card)',
                        border: '1px solid var(--color-hairline)',
                        borderRadius: 12,
                        fontSize: 12,
                    }}
                    formatter={(value) => [formatKg(Number(value)) ?? '-', 'Weight']}
                />
                <Line
                    dataKey="value"
                    stroke={color}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: color, stroke: color }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={!reduceMotion}
                />
            </LineChart>
        </ResponsiveContainer>
    )
}
