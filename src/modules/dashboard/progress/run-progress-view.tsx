'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useState } from 'react'
import type { ZoneNumber } from '@/_bff/core/constants/hr-zones.constants'
import type { CalendarItem } from '@/_bff/modules/training/types'
import type { RunProgressDTO } from '@/_bff/modules/training/types/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BucketChartCard } from '@/modules/dashboard/progress/bucket-chart-card'
import { ChartCard } from '@/modules/dashboard/progress/chart-card'
import { ChartFrame, ChartFrameSkeleton } from '@/modules/dashboard/progress/chart-frame'
import {
    bucketLabel,
    bucketRangeLabel,
    defaultZone,
    paceSummary,
    ZONE_TREND_WINDOW,
    zoneSeries,
    zonesWithData,
    zoneSummary,
} from '@/modules/dashboard/progress/progress-utils'
import { GoalPaceCard } from '@/modules/dashboard/progress/goal-pace-card'
import { RaceBanner } from '@/modules/dashboard/progress/race-banner'
import { RaceReadinessCard } from '@/modules/dashboard/progress/race-readiness-card'
import { ProgressHero, ProgressHeroLoading } from '@/modules/dashboard/progress/progress-hero'
import { RecentRuns } from '@/modules/dashboard/progress/recent-runs'
import { WeekDots, WeekDotsLoading } from '@/modules/dashboard/progress/week-dots'
import { ZONE_STYLES, HEART_RATE_COLOR } from '@/modules/dashboard/progress/series-styles'
import { SeriesMarker } from '@/modules/dashboard/progress/series-marker'

type Props = {
    data: RunProgressDTO
}

type ViewProps = Props & {
    // The last weeks of activities and today, for the week dots and the feed.
    items: CalendarItem[]
    today: string
}

type ZonePick = ZoneNumber | 'all'

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

function ZoneEmpty({ testId, children }: { testId: string; children: React.ReactNode }) {
    return (
        <p data-testid={testId} className="text-sm text-muted-foreground">
            {children}
        </p>
    )
}

const PACE_TITLE = 'Pace trend'
const ZONE_TITLE = 'Pace by heart rate zone'
const ZONE_TAKEAWAY = 'Average pace inside each zone, so you see if the same effort gets faster.'
const ALL_ZONES_TAKEAWAY = 'The trend of every zone. Pick one to see its weekly points.'

function ZoneCard({ data }: Props) {
    const { buckets, granularity, zoneBounds, hasZoneData } = data
    const [picked, setPicked] = useState<ZonePick | null>(null)

    const withData = zonesWithData(buckets)
    const pick: ZonePick | null =
        picked === 'all' || (picked !== null && withData.includes(picked))
            ? picked
            : defaultZone(buckets)
    const series = pick === null ? [] : zoneSeries(buckets, pick === 'all' ? withData : [pick])
    const showChart = zoneBounds !== null && hasZoneData && series.length > 0
    const summaries = series.map(({ zone, points }) => zoneSummary(points, zone))
    let takeaway = ZONE_TAKEAWAY
    if (showChart) takeaway = pick === 'all' ? ALL_ZONES_TAKEAWAY : (summaries[0] ?? ZONE_TAKEAWAY)
    const footnote =
        pick === 'all'
            ? `Faster is up. Each line smooths the last ${ZONE_TREND_WINDOW} points of its zone. A point needs 5 minutes in the zone.`
            : `Faster is up. Markers are each ${granularity}'s average and the line smooths the last ${ZONE_TREND_WINDOW}. A point needs 5 minutes in the zone.`

    const picker =
        showChart && pick !== null ? (
            <Tabs
                value={pick}
                onValueChange={(value) => {
                    const next = value === 'all' ? 'all' : withData.find((zone) => zone === value)
                    if (next !== undefined) setPicked(next)
                }}
                className="w-full sm:w-auto"
            >
                <TabsList
                    aria-label="Heart rate zone"
                    className="grid h-auto w-full auto-cols-fr grid-flow-col sm:w-fit"
                >
                    {withData.map((value) => {
                        const style = ZONE_STYLES[value]
                        return (
                            <TabsTrigger
                                key={value}
                                value={value}
                                data-testid={`zone-tab-${value}`}
                                className="h-11 sm:h-8 sm:px-3"
                            >
                                <svg
                                    width="12"
                                    height="12"
                                    viewBox="-6 -6 12 12"
                                    aria-hidden="true"
                                >
                                    <SeriesMarker kind={style.marker} color={style.color} />
                                </svg>
                                Z{value}
                            </TabsTrigger>
                        )
                    })}
                    {withData.length > 1 ? (
                        <TabsTrigger
                            value="all"
                            data-testid="zone-tab-all"
                            className="h-11 sm:h-8 sm:px-3"
                        >
                            All
                        </TabsTrigger>
                    ) : null}
                </TabsList>
            </Tabs>
        ) : undefined

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
    else if (showChart)
        body = (
            <ChartFrame testId="zone-chart-figure" label={summaries.join(' ')}>
                <ZonePaceChart series={series} granularity={granularity} />
            </ChartFrame>
        )
    else
        body = (
            <ZoneEmpty testId="zone-chart-empty-data">
                No zone data yet. Upload a run with heart rate.
            </ZoneEmpty>
        )

    return (
        <ChartCard
            testId="zone-chart"
            title={ZONE_TITLE}
            takeaway={takeaway}
            controls={picker}
            footnote={showChart ? footnote : undefined}
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
            title={PACE_TITLE}
            takeaway={paceSummary(buckets, range)}
            footnote="Faster is up."
        >
            <ChartFrame testId="pace-chart-figure" label={paceSummary(buckets, range)}>
                <PaceChart buckets={buckets} goal={goal} granularity={granularity} />
            </ChartFrame>
        </ChartCard>
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
                range: bucketRangeLabel(bucket.start, granularity),
                value: bucket.avgHrBpm,
            }))}
            format={(value) => `${value} bpm`}
            formatAxis={String}
            valueName="Heart rate"
        />
    )
}

// The running mode of the dashboard, in the order of a training app: the next race and how ready
// you are, this week, the progress chart, the goal, the latest runs, then pace, zones and heart rate.
export function RunProgressView({ data, items, today }: ViewProps) {
    // The race comes first and shows even before the first run: it is what the training is for.
    const race =
        data.readiness === null ? null : (
            <div className="space-y-4">
                <RaceBanner readiness={data.readiness} />
                <RaceReadinessCard readiness={data.readiness} />
            </div>
        )

    if (data.kpis.runs === 0)
        return (
            <div data-testid="run-progress-empty-wrap" className="space-y-4">
                {race}
                <p
                    data-testid="run-progress-empty"
                    className="rounded-[var(--radius-surface)] shadow-soft bg-card p-5 text-sm text-muted-foreground"
                >
                    Upload a run to see your pace.
                </p>
            </div>
        )

    return (
        <div data-testid="run-progress" className="space-y-4">
            {race}
            <WeekDots items={items} today={today} />
            <ProgressHero data={data} />
            <GoalPaceCard goal={data.goal} deltaSecPerKm={data.kpis.goalDeltaSecPerKm} />
            <RecentRuns items={items} />
            <PaceCard data={data} />
            <ZoneCard data={data} />
            <HeartRateCard data={data} />
        </div>
    )
}

/**
 * The running layout while the series loads: the week, the headline and the pace charts with their
 * titles. The race and goal cards wait for the data, since an athlete may have neither.
 */
export function RunProgressLoading() {
    return (
        <div data-testid="run-progress-loading" aria-busy className="space-y-4">
            <WeekDotsLoading />
            <ProgressHeroLoading />
            <ChartCard testId="pace-chart" title={PACE_TITLE} takeaway={null}>
                <ChartFrameSkeleton />
            </ChartCard>
            <ChartCard testId="zone-chart" title={ZONE_TITLE} takeaway={null}>
                <ChartFrameSkeleton />
            </ChartCard>
        </div>
    )
}
