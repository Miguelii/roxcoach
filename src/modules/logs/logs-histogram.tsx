'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { LogLevel, LogRange } from '@/_bff/core/constants/logs.constants'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { AXIS_COLOR, GRID_COLOR } from '@/modules/dashboard/progress/series-styles'
import { LOG_LEVEL_CHART_COLOR, LOG_LEVEL_LABEL } from '@/modules/logs/logs-ui.constants'
import { formatLogTime, type HistogramBucket } from '@/modules/logs/logs.utils'

type Props = {
    buckets: HistogramBucket[]
    range: LogRange
}

const STACK_ORDER: LogLevel[] = ['debug', 'info', 'warn', 'error']
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 }
const TOOLTIP_STYLE = {
    background: 'var(--color-card)',
    border: '1px solid var(--color-hairline)',
    borderRadius: 12,
    fontSize: 12,
}

export function LogsHistogram({ buckets, range }: Props) {
    const reduceMotion = usePrefersReducedMotion()
    const label = (start: number) => formatLogTime(new Date(start).toISOString(), range)

    return (
        <div
            role="img"
            aria-label="Logs over time by level"
            data-testid="logs-histogram"
            className="h-40 w-full min-w-0 md:h-48"
        >
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={buckets} margin={MARGIN} barCategoryGap={2}>
                    <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                    <XAxis
                        dataKey="start"
                        tickFormatter={label}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={32}
                        tick={{ fill: AXIS_COLOR, fontSize: 11 }}
                    />
                    <YAxis
                        width={32}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        tick={{ fill: AXIS_COLOR, fontSize: 11 }}
                    />
                    <Tooltip
                        cursor={{ fill: 'var(--color-muted)', opacity: 0.5 }}
                        contentStyle={TOOLTIP_STYLE}
                        labelFormatter={(start) => label(Number(start))}
                    />
                    {STACK_ORDER.map((level) => (
                        <Bar
                            key={level}
                            dataKey={level}
                            name={LOG_LEVEL_LABEL[level]}
                            stackId="logs"
                            fill={LOG_LEVEL_CHART_COLOR[level]}
                            isAnimationActive={!reduceMotion}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
