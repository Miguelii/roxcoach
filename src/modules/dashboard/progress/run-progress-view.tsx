'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useState } from 'react'
import { HR_ZONES, type ZoneNumber } from '@/_bff/core/constants/hr-zones.constants'
import { formatPaceSeconds } from '@/_bff/core/utils/formatters.utils'
import type { RunBucketDTO, RunProgressDTO } from '@/_bff/modules/training/types/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { BucketChartCard } from '@/modules/dashboard/progress/bucket-chart-card'
import { ChartCard } from '@/modules/dashboard/progress/chart-card'
import { ChartFrame } from '@/modules/dashboard/progress/chart-frame'
import { bucketLabel, paceSummary, rangeLabel } from '@/modules/dashboard/progress/progress-utils'
import { RunKpis } from '@/modules/dashboard/progress/run-kpis'
import {
    ZONE_STYLES,
    PACE_COLOR,
    HEART_RATE_COLOR,
} from '@/modules/dashboard/progress/series-styles'
import { SeriesMarker } from '@/modules/dashboard/progress/series-marker'

type Props = {
    data: RunProgressDTO
}

const ChartSkeleton = () => <Skeleton className="h-full w-full" />

const PaceChart = dynamic(
    () => import('@/modules/dashboard/progress/pace-chart').then((module) => module.PaceChart),
    { ssr: false, loading: ChartSkeleton }
)
const ZonePaceChart = dynamic(
    () =>
        import('@/modules/dashboard/progress/zone-pace-chart').then(
            (module) => module.ZonePaceChart
        ),
    { ssr: false, loading: ChartSkeleton }
)

const zonePoint = (bucket: RunBucketDTO, zone: ZoneNumber) =>
    bucket.zones.find((point) => point.zone === zone)

function ZoneEmpty({ testId, children }: { testId: string; children: React.ReactNode }) {
    return (
        <p data-testid={testId} className="text-sm text-muted-foreground">
            {children}
        </p>
    )
}

function ZoneCard({ data }: Props) {
    const [hidden, setHidden] = useState<ZoneNumber[]>([])
    const { buckets, granularity, zoneBounds, hasZoneData } = data

    const withData = HR_ZONES.map((zone) => zone.zone).filter((zone) =>
        buckets.some((bucket) => zonePoint(bucket, zone)?.paceSecPerKm != null)
    )
    const visible = withData.filter((zone) => !hidden.includes(zone))

    const toggle = (zone: ZoneNumber) =>
        setHidden((current) =>
            current.includes(zone) ? current.filter((z) => z !== zone) : [...current, zone]
        )

    const legend = (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Zones shown">
            {withData.map((zone) => {
                const style = ZONE_STYLES[zone]
                const shown = !hidden.includes(zone)
                return (
                    <button
                        key={zone}
                        type="button"
                        data-testid={`zone-toggle-${zone}`}
                        aria-pressed={shown}
                        onClick={() => toggle(zone)}
                        className={cn(
                            'inline-flex h-11 items-center gap-2 rounded-full border border-ink/15 px-3 text-sm font-medium sm:h-8',
                            shown ? 'bg-card' : 'bg-muted text-muted-foreground line-through'
                        )}
                    >
                        <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
                            <SeriesMarker kind={style.marker} color={style.color} />
                        </svg>
                        Z{zone}
                    </button>
                )
            })}
        </div>
    )

    let body: React.ReactNode
    if (zoneBounds === null)
        body = (
            <ZoneEmpty testId="zone-chart-empty-settings">
                Add your max and resting heart rate in{' '}
                <Link href="/settings" className="underline">
                    Settings
                </Link>{' '}
                to see zones.
            </ZoneEmpty>
        )
    else if (!hasZoneData)
        body = (
            <ZoneEmpty testId="zone-chart-empty-data">
                No zone data yet. Upload a run with heart rate.
            </ZoneEmpty>
        )
    else
        body = (
            <>
                {visible.length === 0 ? (
                    <ZoneEmpty testId="zone-chart-all-hidden">Every zone is hidden.</ZoneEmpty>
                ) : (
                    <ChartFrame
                        testId="zone-chart-figure"
                        label={`Pace in each heart rate zone, ${visible.map((z) => `Z${z}`).join(', ')}.`}
                    >
                        <ZonePaceChart
                            buckets={buckets}
                            zones={visible}
                            granularity={granularity}
                        />
                    </ChartFrame>
                )}
            </>
        )

    return (
        <ChartCard
            testId="zone-chart"
            title="Pace by heart rate zone"
            takeaway={`Average pace inside each zone, per ${granularity}.`}
            controls={zoneBounds !== null && hasZoneData ? legend : undefined}
            footnote="Zones come from your max and resting heart rate. A point needs at least 5 minutes in the zone."
        >
            {body}
        </ChartCard>
    )
}

function PaceCard({ data }: Props) {
    const { buckets, granularity, goal, range } = data

    return (
        <ChartCard
            testId="pace-chart"
            title="Pace trend"
            takeaway={paceSummary(buckets, range)}
            footnote="Faster is up."
        >
            <ChartFrame testId="pace-chart-figure" label={paceSummary(buckets, range)}>
                <PaceChart buckets={buckets} goal={goal} granularity={granularity} />
            </ChartFrame>
        </ChartCard>
    )
}

function DistanceCard({ data }: Props) {
    const { buckets, granularity, kpis, range } = data
    return (
        <BucketChartCard
            testId="distance-chart"
            title="Distance"
            takeaway={`${kpis.distanceKm.toFixed(1)} km in ${kpis.runs} runs over ${rangeLabel(range)}.`}
            ariaLabel={`Distance per ${granularity}, ${kpis.distanceKm.toFixed(1)} km in total.`}
            kind="bar"
            color={PACE_COLOR}
            data={buckets.map((bucket) => ({
                label: bucketLabel(bucket.start, granularity),
                value: bucket.runs === 0 ? null : bucket.distanceKm,
            }))}
            format={(value) => `${value.toFixed(1)} km`}
            formatAxis={(value) => String(value)}
            valueName="Distance"
        />
    )
}

function HeartRateCard({ data }: Props) {
    const { buckets, granularity } = data
    const rates = buckets.flatMap((bucket) => bucket.avgHrBpm ?? [])
    const first = rates[0]
    const last = rates.at(-1)
    if (first === undefined || last === undefined) return null

    return (
        <BucketChartCard
            testId="heart-rate-chart"
            title="Average heart rate"
            takeaway={
                rates.length < 2
                    ? `${last} bpm.`
                    : `From ${first} bpm to ${last} bpm, weighted by time.`
            }
            ariaLabel={`Average heart rate per ${granularity}, from ${first} bpm to ${last} bpm.`}
            kind="line"
            color={HEART_RATE_COLOR}
            data={buckets.map((bucket) => ({
                label: bucketLabel(bucket.start, granularity),
                value: bucket.avgHrBpm,
            }))}
            format={(value) => `${value} bpm`}
            formatAxis={(value) => String(value)}
            valueName="Heart rate"
        />
    )
}

// The running mode of the dashboard: KPIs, pace, zones, distance and heart rate.
export function RunProgressView({ data }: Props) {
    if (data.kpis.runs === 0)
        return (
            <p
                data-testid="run-progress-empty"
                className="rounded-[var(--radius-surface)] border border-ink/10 bg-card p-5 text-sm text-muted-foreground"
            >
                Upload a run to see your pace.
            </p>
        )

    return (
        <div data-testid="run-progress" className="space-y-4">
            <RunKpis kpis={data.kpis} goal={data.goal} />
            <PaceCard data={data} />
            <ZoneCard data={data} />
            <DistanceCard data={data} />
            <HeartRateCard data={data} />
        </div>
    )
}
