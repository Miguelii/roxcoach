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
import type { ZoneNumber } from '@/_bff/core/constants/hr-zones.constants'
import { formatClock, formatPaceSeconds } from '@/_bff/core/utils/formatters.utils'
import type { RunBucketDTO } from '@/_bff/modules/training/types/progress'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { bucketLabel, bucketRangeLabel } from '@/modules/dashboard/progress/progress-utils'
import { AXIS_COLOR, GRID_COLOR, ZONE_STYLES } from '@/modules/dashboard/progress/series-styles'
import { SeriesMarker } from '@/modules/dashboard/progress/series-marker'

type Props = {
    buckets: RunBucketDTO[]
    zones: ZoneNumber[]
    granularity: 'week' | 'month'
}

type DotProps = { cx?: number; cy?: number; value?: number | null }

const PADDING_S = 10
const STEP_S = 5

const zoneOf = (bucket: RunBucketDTO, zone: ZoneNumber) =>
    bucket.zones.find((point) => point.zone === zone)

// One line per visible zone, each with its own marker. A zone has no point in a bucket with less
// than five minutes in it. The axis is reversed so a faster pace sits higher.
export function ZonePaceChart({ buckets, zones, granularity }: Props) {
    const reduceMotion = usePrefersReducedMotion()
    const data = buckets.map((bucket) => ({
        label: bucketLabel(bucket.start, granularity),
        range: bucketRangeLabel(bucket.start, granularity),
        ...Object.fromEntries(
            zones.flatMap((zone) => [
                [`z${zone}`, zoneOf(bucket, zone)?.paceSecPerKm ?? null],
                [`m${zone}`, zoneOf(bucket, zone)?.minutes ?? 0],
            ])
        ),
    }))
    const values = buckets.flatMap((bucket) =>
        zones.flatMap((zone) => zoneOf(bucket, zone)?.paceSecPerKm ?? [])
    )
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
                    formatter={(value, name, item) => {
                        const zone = Number(String(name).slice(1))
                        const minutes: unknown = item.payload?.[`m${zone}`]
                        return [
                            `${formatPaceSeconds(Number(value)) ?? '-'} (${Math.round(Number(minutes))} min)`,
                            `Z${zone}`,
                        ]
                    }}
                />
                {zones.map((zone) => {
                    const style = ZONE_STYLES[zone]
                    return (
                        <Line
                            key={zone}
                            dataKey={`z${zone}`}
                            stroke={style.color}
                            strokeDasharray={style.dash}
                            strokeWidth={2}
                            dot={({ cx, cy, value }: DotProps) =>
                                cx === undefined || cy === undefined || value == null ? (
                                    <g key={`${zone}-${cx}-${cy}`} />
                                ) : (
                                    <g key={`${zone}-${cx}-${cy}`}>
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
