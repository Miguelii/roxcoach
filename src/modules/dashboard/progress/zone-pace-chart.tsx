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
import { formatClock, formatPaceSeconds } from '@/_bff/core/utils/formatters.utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import {
    bucketLabel,
    bucketRangeLabel,
    type ZoneSeries,
} from '@/modules/dashboard/progress/progress-utils'
import { AXIS_COLOR, GRID_COLOR, ZONE_STYLES } from '@/modules/dashboard/progress/series-styles'
import { SeriesMarker } from '@/modules/dashboard/progress/series-marker'

type Props = {
    // Every series covers the same buckets (see `zoneSeries`).
    series: ZoneSeries[]
    granularity: 'week' | 'month'
}

type DotProps = { cx?: number; cy?: number; value?: number | null; index?: number }

const PADDING_S = 5
const TICK_STEPS_S = [5, 10, 15, 20, 30, 60, 120]
const MAX_TICKS = 5
const POINT_OPACITY = 0.45
const END_LABEL_SPACE = 32

// The smallest step that keeps the axis to a few round ticks (5:50, 6:00, 6:10).
function paceTicks(min: number, max: number) {
    const step =
        TICK_STEPS_S.find((candidate) => (max - min) / candidate <= MAX_TICKS - 1) ??
        TICK_STEPS_S.at(-1) ??
        60
    const low = Math.floor((min - PADDING_S) / step) * step
    const high = Math.ceil((max + PADDING_S) / step) * step
    const ticks: number[] = []
    for (let tick = low; tick <= high; tick += step) ticks.push(tick)
    return { low, high, ticks }
}

const lastIndexWithData = ({ points }: ZoneSeries) =>
    points.findLastIndex((point) => point.trendSecPerKm !== null)

// One zone shows its bucket averages as faint markers under its trend line. Several zones show only
// their trend lines, each named at its last point so none relies on color alone. The axis is
// reversed so a faster pace sits higher.
export function ZonePaceChart({ series, granularity }: Props) {
    const reduceMotion = usePrefersReducedMotion()
    const single = series.length === 1
    const data = (series[0]?.points ?? []).map((point, index) => ({
        label: bucketLabel(point.start, granularity),
        range: bucketRangeLabel(point.start, granularity),
        ...Object.fromEntries(
            series.flatMap(({ zone, points }) => [
                [`p${zone}`, points[index]?.paceSecPerKm ?? null],
                [`t${zone}`, points[index]?.trendSecPerKm ?? null],
                [`m${zone}`, points[index]?.minutes ?? 0],
            ])
        ),
    }))
    const values = series.flatMap(({ points }) =>
        points.flatMap((point) => (single ? point.paceSecPerKm : point.trendSecPerKm) ?? [])
    )
    const { low, high, ticks } = paceTicks(Math.min(...values), Math.max(...values))

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart
                data={data}
                accessibilityLayer
                margin={{ top: 8, right: single ? 12 : END_LABEL_SPACE, bottom: 0, left: 0 }}
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
                    ticks={ticks}
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
                    formatter={(value, name, item) => {
                        const key = String(name)
                        const zone = key.slice(1)
                        const pace = formatPaceSeconds(Number(value)) ?? '-'
                        if (key.startsWith('t')) return [pace, single ? 'Trend' : `Z${zone}`]
                        const minutes: unknown = item.payload?.[`m${zone}`]
                        return [`${pace} (${Math.round(Number(minutes))} min)`, `Z${zone}`]
                    }}
                />
                {single
                    ? series.map(({ zone }) => {
                          const style = ZONE_STYLES[zone]
                          return (
                              <Line
                                  key={`p${zone}`}
                                  dataKey={`p${zone}`}
                                  stroke="none"
                                  // oxlint-disable-next-line react/no-unstable-nested-components -- recharts calls this as a render function, not as a component
                                  dot={({ cx, cy, value }: DotProps) =>
                                      cx === undefined || cy === undefined || value == null ? (
                                          <g key={`${cx}-${cy}`} />
                                      ) : (
                                          <g key={`${cx}-${cy}`} opacity={POINT_OPACITY}>
                                              <SeriesMarker
                                                  kind={style.marker}
                                                  color={style.color}
                                                  x={cx}
                                                  y={cy}
                                              />
                                          </g>
                                      )
                                  }
                                  activeDot={false}
                                  isAnimationActive={false}
                              />
                          )
                      })
                    : null}
                {series.map((zoneSeries) => {
                    const { zone } = zoneSeries
                    const style = ZONE_STYLES[zone]
                    const lastIndex = lastIndexWithData(zoneSeries)
                    return (
                        <Line
                            key={`t${zone}`}
                            dataKey={`t${zone}`}
                            type="monotone"
                            stroke={style.color}
                            strokeDasharray={style.dash}
                            strokeWidth={single ? 2.5 : 2}
                            // oxlint-disable-next-line react/no-unstable-nested-components -- recharts calls this as a render function, not as a component
                            dot={({ cx, cy, index }: DotProps) =>
                                single ||
                                index !== lastIndex ||
                                cx === undefined ||
                                cy === undefined ? (
                                    <g key={`${zone}-${index}`} />
                                ) : (
                                    <g key={`${zone}-${index}`}>
                                        <SeriesMarker
                                            kind={style.marker}
                                            color={style.color}
                                            x={cx}
                                            y={cy}
                                        />
                                        <text
                                            x={cx + 8}
                                            y={cy}
                                            dominantBaseline="central"
                                            fontSize={12}
                                            fontWeight={600}
                                            fill={style.color}
                                        >
                                            Z{zone}
                                        </text>
                                    </g>
                                )
                            }
                            activeDot={{ r: 4, fill: style.color, stroke: 'var(--color-card)' }}
                            connectNulls
                            isAnimationActive={!reduceMotion}
                        />
                    )
                })}
            </LineChart>
        </ResponsiveContainer>
    )
}
