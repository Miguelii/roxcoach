'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useState } from 'react'
import { HR_ZONES, type ZoneNumber } from '@/_bff/core/constants/hr-zones.constants'
import { formatPaceSeconds } from '@/_bff/core/utils/formatters.utils'
import type { RunBucketDTO, RunProgressDTO } from '@/_bff/modules/training/types/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ChartCard } from '@/modules/dashboard/progress/chart-card'
import { ChartDataTable } from '@/modules/dashboard/progress/chart-data-table'
import { ChartFrame } from '@/modules/dashboard/progress/chart-frame'
import { bucketLabel, paceSummary } from '@/modules/dashboard/progress/progress-utils'
import { RunKpis } from '@/modules/dashboard/progress/run-kpis'
import { ZONE_STYLES } from '@/modules/dashboard/progress/series-styles'
import { ZoneMarker } from '@/modules/dashboard/progress/zone-marker'

type Props = {
    data: RunProgressDTO
}

// A line needs a few points to say anything; with fewer, the table is shown instead.
const MIN_POINTS_TO_DRAW = 4

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
    const pointCount = buckets.filter((bucket) =>
        visible.some((zone) => zonePoint(bucket, zone)?.paceSecPerKm != null)
    ).length

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
                            <ZoneMarker kind={style.marker} color={style.color} />
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
                {visible.length > 0 && pointCount >= MIN_POINTS_TO_DRAW ? (
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
                ) : null}
                {visible.length === 0 ? (
                    <ZoneEmpty testId="zone-chart-all-hidden">Every zone is hidden.</ZoneEmpty>
                ) : (
                    <ChartDataTable
                        testId="zone-chart-table"
                        caption="Pace and minutes by heart rate zone"
                        columns={[
                            granularity === 'week' ? 'Week' : 'Month',
                            ...visible.map((z) => `Z${z}`),
                        ]}
                        rows={buckets.map((bucket) => [
                            bucketLabel(bucket.start, granularity),
                            ...visible.map((zone) => {
                                const point = zonePoint(bucket, zone)
                                const pace = formatPaceSeconds(point?.paceSecPerKm)
                                return pace === null || point === undefined
                                    ? null
                                    : `${pace} (${Math.round(point.minutes)} min)`
                            }),
                        ])}
                        defaultOpen={pointCount < MIN_POINTS_TO_DRAW}
                    />
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
    const pointCount = buckets.filter((bucket) => bucket.paceSecPerKm !== null).length

    return (
        <ChartCard
            testId="pace-chart"
            title="Pace trend"
            takeaway={paceSummary(buckets, range)}
            footnote="Faster is up."
        >
            {pointCount >= MIN_POINTS_TO_DRAW ? (
                <ChartFrame testId="pace-chart-figure" label={paceSummary(buckets, range)}>
                    <PaceChart buckets={buckets} goal={goal} granularity={granularity} />
                </ChartFrame>
            ) : null}
            <ChartDataTable
                testId="pace-chart-table"
                caption="Average pace, distance and runs"
                columns={[granularity === 'week' ? 'Week' : 'Month', 'Pace', 'Distance', 'Runs']}
                rows={buckets.map((bucket) => [
                    bucketLabel(bucket.start, granularity),
                    formatPaceSeconds(bucket.paceSecPerKm),
                    bucket.runs === 0 ? null : `${bucket.distanceKm.toFixed(1)} km`,
                    bucket.runs === 0 ? null : bucket.runs,
                ])}
                defaultOpen={pointCount < MIN_POINTS_TO_DRAW}
            />
        </ChartCard>
    )
}

// The running mode of the dashboard: KPIs, the pace trend and pace by heart rate zone.
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
        </div>
    )
}
