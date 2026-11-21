'use client'

import {
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { AXIS_COLOR, GRID_COLOR } from '@/modules/dashboard/progress/series-styles'

// `range` is the full name of the bucket, shown as the tooltip title instead of the short label.
export type BucketPoint = { label: string; value: number | null; range?: string }

type Props = {
    kind: 'bar' | 'line'
    data: BucketPoint[]
    color: string
    // The value in a tooltip, with its unit.
    format: (value: number) => string
    // The value on the Y axis, short.
    formatAxis: (value: number) => string
    // What the value is called in the tooltip.
    name: string
}

const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 }
const TOOLTIP_STYLE = {
    background: 'var(--color-card)',
    border: '1px solid var(--color-hairline)',
    borderRadius: 12,
    fontSize: 12,
}

// One value per bucket (week or month): bars for totals, a line for averages. The axis of bars
// starts at zero so their height is honest.
export function BucketChart({ kind, data, color, format, formatAxis, name }: Props) {
    const reduceMotion = usePrefersReducedMotion()
    const values = data.flatMap((point) => point.value ?? [])
    const lineLow = Math.floor(Math.min(...values) - 3)
    const lineHigh = Math.ceil(Math.max(...values) + 3)

    const axes = (
        <>
            <CartesianGrid vertical={false} stroke={GRID_COLOR} />
            <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tick={{ fill: AXIS_COLOR, fontSize: 11 }}
            />
            <YAxis
                domain={kind === 'bar' ? [0, 'auto'] : [lineLow, lineHigh]}
                width={40}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tickFormatter={formatAxis}
                tick={{ fill: AXIS_COLOR, fontSize: 11 }}
            />
            <Tooltip
                cursor={kind === 'bar' ? { fill: 'var(--color-muted)', opacity: 0.5 } : undefined}
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(label, payload) => payload[0]?.payload.range ?? label}
                formatter={(value) => [format(Number(value)), name]}
            />
        </>
    )

    return (
        <ResponsiveContainer width="100%" height="100%">
            {kind === 'bar' ? (
                <BarChart data={data} accessibilityLayer margin={MARGIN}>
                    {axes}
                    <Bar
                        dataKey="value"
                        fill={color}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                        isAnimationActive={!reduceMotion}
                    />
                </BarChart>
            ) : (
                <LineChart data={data} accessibilityLayer margin={MARGIN}>
                    {axes}
                    <Line
                        dataKey="value"
                        stroke={color}
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: color, stroke: color }}
                        activeDot={{ r: 5 }}
                        connectNulls
                        isAnimationActive={!reduceMotion}
                    />
                </LineChart>
            )}
        </ResponsiveContainer>
    )
}
