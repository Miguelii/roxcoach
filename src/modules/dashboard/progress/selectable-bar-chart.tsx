'use client'

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { AXIS_COLOR, GRID_COLOR } from '@/modules/dashboard/progress/series-styles'

type Props = {
    data: { label: string; value: number }[]
    selected: number
    onSelect: (index: number) => void
    formatAxis: (value: number) => string
}

const MARGIN = { top: 8, right: 4, bottom: 0, left: 0 }
const SELECTED_COLOR = 'var(--color-ink)'
const MUTED_COLOR = 'color-mix(in srgb, var(--color-ink) 22%, transparent)'

// A bar per week or month; tapping a bar selects it and the selected one takes the accent color.
export function SelectableBarChart({ data, selected, onSelect, formatAxis }: Props) {
    const reduceMotion = usePrefersReducedMotion()

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} accessibilityLayer margin={MARGIN} barCategoryGap="18%">
                <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={20}
                    tick={{ fill: AXIS_COLOR, fontSize: 11 }}
                />
                <YAxis
                    orientation="right"
                    domain={[0, 'auto']}
                    width={34}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tickFormatter={formatAxis}
                    tick={{ fill: AXIS_COLOR, fontSize: 11 }}
                />
                <Bar
                    dataKey="value"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={26}
                    style={{ cursor: 'pointer' }}
                    onClick={(_bar, index) => onSelect(index)}
                    isAnimationActive={!reduceMotion}
                >
                    {data.map((point, index) => (
                        <Cell
                            key={point.label}
                            fill={index === selected ? SELECTED_COLOR : MUTED_COLOR}
                        />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    )
}
