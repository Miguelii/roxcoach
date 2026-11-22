import { formatClock } from '@/_bff/core/utils/formatters.utils'
import type { LapDTO } from '@/_bff/modules/training/types'
import { RunAreaChart } from '@/modules/activity/run-area-chart'
import {
    barShare,
    toChartPoints,
    toRunSplits,
    type RunSplit,
} from '@/modules/activity/run-chart-utils'

type Props = { laps: LapDTO[] }

type ChartCardProps = {
    title: string
    note: string
    children: React.ReactNode
}

const DASH = '-'
const KM_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

// Full kilometers show their number, a short final split shows its distance (`0.5`).
// `position` is the 1-based place in the list, since lap indexes may start at 0.
const splitLabel = (split: RunSplit, position: number) =>
    split.distanceM >= 950 ? String(position) : KM_FORMATTER.format(split.distanceM / 1000)

function ChartCard({ title, note, children }: ChartCardProps) {
    return (
        <section aria-label={title} className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="display text-3xl">{title}</h2>
                <p className="text-xs text-muted-foreground">{note}</p>
            </div>
            <div className="rounded-[var(--radius-surface-inner)] shadow-soft bg-card p-3 sm:p-5">
                {children}
            </div>
        </section>
    )
}

// Run detail: Strava-style splits with pace bars, then a pace chart and a heart rate chart.
// Stored data is per lap, so the charts are lap resolution, not per second.
export function RunSplits({ laps }: Props) {
    const splits = toRunSplits(laps)
    if (splits.length === 0) return null

    const paces = splits.map((split) => split.paceSPerKm)
    const fastest = Math.min(...paces)
    const slowest = Math.max(...paces)

    const pacePoints = toChartPoints(splits, (split) => split.paceSPerKm)
    const hrPoints = toChartPoints(splits, (split) => split.avgHr)
    const hasHr = hrPoints.length > 3

    return (
        <>
            <section data-testid="run-splits" aria-label="Splits" className="space-y-3">
                <h2 className="display text-3xl">Splits</h2>
                <div className="rounded-[var(--radius-surface-inner)] shadow-soft bg-card px-4 py-4 sm:px-6">
                    <div className="grid grid-cols-[2.5rem_3.25rem_1fr_3.25rem] items-center gap-x-3 border-b border-hairline pb-3 text-sm text-muted-foreground">
                        <span>Km</span>
                        <span>Pace</span>
                        <span />
                        <span className="text-right">HR</span>
                    </div>
                    <ol className="mt-3 space-y-2">
                        {splits.map((split, position) => (
                            <li
                                key={split.lapIndex}
                                data-testid={`split-${split.lapIndex}`}
                                className="grid grid-cols-[2.5rem_3.25rem_1fr_3.25rem] items-center gap-x-3 font-mono text-sm"
                            >
                                <span data-testid={`split-${split.lapIndex}-km`}>
                                    {splitLabel(split, position + 1)}
                                </span>
                                <span data-testid={`split-${split.lapIndex}-pace`}>
                                    {formatClock(split.paceSPerKm) ?? DASH}
                                </span>
                                <span
                                    aria-hidden
                                    data-testid={`split-${split.lapIndex}-bar`}
                                    className="block h-[1.125rem] rounded-md bg-blue"
                                    style={{
                                        width: `${barShare(split.paceSPerKm, fastest, slowest)}%`,
                                    }}
                                />
                                <span
                                    data-testid={`split-${split.lapIndex}-hr`}
                                    className="text-right"
                                >
                                    {split.avgHr ? Math.round(split.avgHr) : DASH}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {pacePoints.length > 3 && (
                <ChartCard title="Pace" note="Press and drag to read a value">
                    <RunAreaChart
                        testId="run-pace-chart"
                        label="Pace per kilometer across the run"
                        points={pacePoints}
                        kind="pace"
                    />
                </ChartCard>
            )}

            {hasHr && (
                <ChartCard title="Heart rate" note="Press and drag to read a value">
                    <RunAreaChart
                        testId="run-hr-chart"
                        label="Heart rate across the run"
                        points={hrPoints}
                        kind="hr"
                    />
                </ChartCard>
            )}
        </>
    )
}
