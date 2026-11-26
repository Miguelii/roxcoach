'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import {
    formatCompact,
    formatDuration,
    formatPaceSeconds,
} from '@/_bff/core/utils/formatters.utils'
import type { RunBucketDTO, RunProgressDTO } from '@/_bff/modules/training/types/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChangeBadge } from '@/modules/dashboard/progress/change-badge'
import { ChartFrame, ChartFrameSkeleton } from '@/modules/dashboard/progress/chart-frame'
import { bucketLabel, bucketRangeLabel } from '@/modules/dashboard/progress/progress-utils'

type Props = {
    data: RunProgressDTO
}

type Metric = 'distance' | 'time' | 'runs'

type MetricTabsProps = {
    value: Metric
    onChange?: (metric: Metric) => void
}

type StepButtonsProps = {
    period: string
    canGoBack: boolean
    canGoForward: boolean
    onBack?: () => void
    onForward?: () => void
}

type StatProps = {
    id: string
    label: string
    // Null while the data loads.
    value: string | null
}

const METRICS: { value: Metric; label: string }[] = [
    { value: 'distance', label: 'Distance' },
    { value: 'time', label: 'Time' },
    { value: 'runs', label: 'Runs' },
]

const SelectableBarChart = dynamic(
    () =>
        import('@/modules/dashboard/progress/selectable-bar-chart').then(
            (module) => module.SelectableBarChart
        ),
    { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
)

const SECTION = 'space-y-5 rounded-[var(--radius-surface)] shadow-soft bg-card p-4 md:p-6'
const STATS = 'grid grid-cols-2 gap-x-4 gap-y-3 border-t border-hairline pt-4 sm:grid-cols-4'
const STEP_BUTTON =
    'flex size-11 items-center justify-center rounded-full border border-ink/15 transition-colors enabled:hover:bg-muted disabled:opacity-40'

// Tabs report any string; only accept a metric this card offers.
const asMetric = (value: string) => METRICS.find((metric) => metric.value === value)?.value

const valueOf = (bucket: RunBucketDTO, metric: Metric) => {
    if (metric === 'distance') return bucket.distanceKm
    if (metric === 'time') return bucket.movingTimeS
    return bucket.runs
}

const formatValue = (metric: Metric, value: number) => {
    if (metric === 'distance') return `${value.toFixed(1)} km`
    if (metric === 'time') return formatDuration(value) ?? '0m'
    return String(value)
}

const formatAxis = (metric: Metric, value: number) => {
    if (metric === 'time') return `${Math.round(value / 3600)}h`
    return formatCompact(value)
}

// The headline of the running dashboard: one number for the week or month you are looking at,
// how it compares with the one before, and a bar per week to pick another.
export function ProgressHero({ data }: Props) {
    const { buckets, granularity } = data
    const [metric, setMetric] = useState<Metric>('distance')
    const [picked, setPicked] = useState<number | null>(null)

    const last = buckets.length - 1
    const index = Math.min(picked ?? last, last)
    const bucket = buckets[index]
    const previous = buckets.slice(Math.max(index - 1, 0), index)[0]
    if (bucket === undefined) return null

    const period = granularity === 'week' ? 'week' : 'month'
    const current = valueOf(bucket, metric)
    const delta = previous === undefined ? null : current - valueOf(previous, metric)
    const eyebrow =
        index === last
            ? `This ${period}`
            : granularity === 'week'
              ? bucketRangeLabel(bucket.start, granularity)
              : bucketLabel(bucket.start, granularity)

    return (
        <section data-testid="progress-hero" aria-label="Training progress" className={SECTION}>
            <MetricTabs value={metric} onChange={setMetric} />

            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                    <p data-testid="hero-eyebrow" className="eyebrow text-muted-foreground">
                        {eyebrow}
                    </p>
                    <p
                        data-testid="hero-value"
                        className="display text-5xl tabular-nums md:text-6xl"
                    >
                        {formatValue(metric, current)}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <ChangeBadge
                            delta={delta}
                            format={(absolute) => formatValue(metric, absolute)}
                            testId="hero-delta"
                        />
                        <span>vs previous {period}</span>
                    </p>
                </div>
                <StepButtons
                    period={period}
                    canGoBack={index > 0}
                    canGoForward={index < last}
                    onBack={() => setPicked(index - 1)}
                    onForward={() => setPicked(index + 1)}
                />
            </div>

            <ChartFrame
                testId="hero-figure"
                label={`${METRICS.find((m) => m.value === metric)?.label ?? ''} per ${period}, ${eyebrow.toLowerCase()}: ${formatValue(metric, current)}.`}
            >
                <SelectableBarChart
                    data={buckets.map((item) => ({
                        label: bucketLabel(item.start, granularity),
                        value: valueOf(item, metric),
                    }))}
                    selected={index}
                    onSelect={setPicked}
                    formatAxis={(value) => formatAxis(metric, value)}
                />
            </ChartFrame>

            <dl className={STATS}>
                <Stat id="distance" label="Distance" value={`${bucket.distanceKm.toFixed(1)} km`} />
                <Stat id="time" label="Time" value={formatDuration(bucket.movingTimeS) ?? '0m'} />
                <Stat id="runs" label="Runs" value={String(bucket.runs)} />
                <Stat
                    id="pace"
                    label="Avg pace"
                    value={formatPaceSeconds(bucket.paceSecPerKm) ?? '-'}
                />
            </dl>
        </section>
    )
}

function MetricTabs({ value, onChange }: MetricTabsProps) {
    return (
        <Tabs
            value={value}
            onValueChange={(next) => {
                const metric = asMetric(next)
                if (metric !== undefined) onChange?.(metric)
            }}
        >
            <TabsList aria-label="Chart metric" className="grid h-auto w-full grid-cols-3">
                {METRICS.map((item) => (
                    <TabsTrigger
                        key={item.value}
                        value={item.value}
                        data-testid={`hero-metric-${item.value}`}
                        className="h-11 sm:h-9"
                    >
                        {item.label}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    )
}

function StepButtons({ period, canGoBack, canGoForward, onBack, onForward }: StepButtonsProps) {
    return (
        <div className="flex shrink-0 gap-1">
            <button
                type="button"
                data-testid="hero-previous"
                aria-label={`Previous ${period}`}
                disabled={!canGoBack}
                onClick={onBack}
                className={STEP_BUTTON}
            >
                <IconChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button
                type="button"
                data-testid="hero-next"
                aria-label={`Next ${period}`}
                disabled={!canGoForward}
                onClick={onForward}
                className={STEP_BUTTON}
            >
                <IconChevronRight className="size-5" aria-hidden="true" />
            </button>
        </div>
    )
}

function Stat({ id, label, value }: StatProps) {
    return (
        <div className="space-y-0.5">
            <dt className="eyebrow text-muted-foreground">{label}</dt>
            {value === null ? (
                <dd>
                    <Skeleton className="mt-1 h-6 w-16" />
                </dd>
            ) : (
                <dd data-testid={`hero-stat-${id}`} className="text-lg font-medium tabular-nums">
                    {value}
                </dd>
            )}
        </div>
    )
}

/** The headline card with its metric tabs, arrows and stat labels while the series loads. */
export function ProgressHeroLoading() {
    return (
        <section
            data-testid="progress-hero-loading"
            aria-label="Training progress"
            aria-busy
            className={SECTION}
        >
            <MetricTabs value="distance" />
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-12 w-40 md:h-14" />
                    <Skeleton className="h-4 w-32" />
                </div>
                <StepButtons period="week" canGoBack={false} canGoForward={false} />
            </div>
            <ChartFrameSkeleton />
            <dl className={STATS}>
                <Stat id="distance" label="Distance" value={null} />
                <Stat id="time" label="Time" value={null} />
                <Stat id="runs" label="Runs" value={null} />
                <Stat id="pace" label="Avg pace" value={null} />
            </dl>
        </section>
    )
}
