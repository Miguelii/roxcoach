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
import type { TopExerciseDTO } from '@/_bff/modules/training/types/progress'
import { formatKg } from '@/_bff/core/utils/formatters.utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { bucketLabel } from '@/modules/dashboard/progress/progress-utils'
import { SeriesMarker } from '@/modules/dashboard/progress/series-marker'
import { AXIS_COLOR, GRID_COLOR, SERIES_STYLES } from '@/modules/dashboard/progress/series-styles'
import {
    buildExerciseRows,
    type ExerciseMode,
} from '@/modules/dashboard/progress/top-exercises-data'

type Props = {
    // Only the exercises to draw; `styleIndexes[i]` is the style slot of `exercises[i]`.
    exercises: TopExerciseDTO[]
    styleIndexes: number[]
    mode: ExerciseMode
}

type DotProps = { cx?: number; cy?: number; value?: number | null }

const PADDING_KG = 5
const PADDING_PERCENT = 2

// One line per exercise over the workout dates. Lines join the workouts where an exercise was
// trained, so a gap between workouts does not break the progression.
export function TopExercisesChart({ exercises, styleIndexes, mode }: Props) {
    const reduceMotion = usePrefersReducedMotion()
    const rows = buildExerciseRows(exercises, mode)
    const data = rows.map((row) => ({
        label: bucketLabel(row.date, 'week'),
        ...Object.fromEntries(row.values.map((value, index) => [`e${index}`, value])),
    }))
    const values = rows.flatMap((row) => row.values.flatMap((value) => value ?? []))
    const padding = mode === 'kg' ? PADDING_KG : PADDING_PERCENT
    const low = Math.floor(Math.min(...values) - padding)
    const high = Math.ceil(Math.max(...values) + padding)

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
                    domain={[low, high]}
                    width={mode === 'kg' ? 40 : 48}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tickFormatter={(value: number) => (mode === 'kg' ? String(value) : `${value}%`)}
                    tick={{ fill: AXIS_COLOR, fontSize: 12 }}
                />
                <Tooltip
                    contentStyle={{
                        background: 'var(--color-card)',
                        border: '1px solid var(--color-hairline)',
                        borderRadius: 12,
                        fontSize: 12,
                    }}
                    formatter={(value) =>
                        mode === 'kg' ? (formatKg(Number(value)) ?? '-') : `${Number(value)}%`
                    }
                />
                {exercises.map((exercise, index) => {
                    const style =
                        SERIES_STYLES[(styleIndexes[index] ?? index) % SERIES_STYLES.length]
                    if (style === undefined) return null
                    return (
                        <Line
                            key={exercise.key}
                            name={exercise.name}
                            dataKey={`e${index}`}
                            stroke={style.color}
                            strokeDasharray={style.dash}
                            strokeWidth={2}
                            connectNulls
                            dot={({ cx, cy, value }: DotProps) =>
                                cx === undefined || cy === undefined || value == null ? (
                                    <g key={`${exercise.key}-${cx}-${cy}`} />
                                ) : (
                                    <g key={`${exercise.key}-${cx}-${cy}`}>
                                        <SeriesMarker
                                            kind={style.marker}
                                            color={style.color}
                                            x={cx}
                                            y={cy}
                                        />
                                    </g>
                                )
                            }
                            isAnimationActive={!reduceMotion}
                        />
                    )
                })}
            </LineChart>
        </ResponsiveContainer>
    )
}
