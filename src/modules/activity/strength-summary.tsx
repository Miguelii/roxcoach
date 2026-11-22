import { IconArrowUpRight, IconTrophy } from '@tabler/icons-react'
import { summarizeWorkout } from '@/_bff/core/helpers/strength-detail.helper'
import type { StrengthSetDTO } from '@/_bff/modules/training/types'
import { InfoTip } from '@/components/ui/info-tip'
import { cn } from '@/lib/utils'
import { KINDS } from '@/modules/calendar/kinds'
import {
    DENSITY_HINT,
    formatStrengthNumber,
    RECORD_LABELS,
    type RecordEntry,
} from '@/modules/activity/strength-utils'

type SummaryMetric = {
    id: string
    label: string
    value: string
    // Small suffix after the value (for example "x reps").
    detail?: string
}

type Props = {
    // The headline numbers of the workout (duration, volume, body weight, ...), already formatted.
    metrics: SummaryMetric[]
    strengthSets: StrengthSetDTO[]
    // Elapsed time of the workout, for the density (volume per minute).
    durationS: number | null
    // The exercises that set records in this workout (see `findRecords`).
    records: RecordEntry[]
    // Whether "no records" is a real answer (there is history to compare with).
    recordsKnown: boolean
}

type Tile = {
    id: string
    testId: string
    label: string
    value: string
    // Small suffix after the value (for example "x reps").
    detail?: string
    // Secondary line under the value.
    hint?: string
    // Explanation shown by the info button next to the label.
    tip?: string
}

const TILE = 'min-w-0 rounded-[var(--radius-surface-inner)] bg-card p-4 shadow-soft'

// Desktop columns per tile count, so the last row is never a lone tile or a big gap.
const desktopColumns = (count: number) => {
    if (count === 1) return 'md:grid-cols-1'
    if (count === 2) return 'md:grid-cols-2'
    if (count === 3 || count === 5 || count === 6 || count === 9) return 'md:grid-cols-3'
    return 'md:grid-cols-4'
}

// The whole workout as separate tiles: the headline numbers, what was done (exercises, sets, reps, the
// heaviest lift, density) and the records set today. Every value comes from the stored sets, so it
// never contradicts the list below.
export function StrengthSummary({
    metrics,
    strengthSets,
    durationS,
    records,
    recordsKnown,
}: Props) {
    const summary = summarizeWorkout(strengthSets)
    const minutes = durationS === null ? 0 : durationS / 60
    const recordCount = records.reduce((total, record) => total + record.kinds.length, 0)

    const stats: Omit<Tile, 'testId'>[] =
        strengthSets.length === 0
            ? []
            : [
                  { id: 'exercises', label: 'Exercises', value: String(summary.exerciseCount) },
                  { id: 'sets', label: 'Sets', value: String(summary.setCount) },
                  { id: 'reps', label: 'Total reps', value: String(summary.totalReps) },
                  ...(summary.heaviest === null
                      ? []
                      : [
                            {
                                id: 'heaviest',
                                label: 'Heaviest set',
                                value: `${formatStrengthNumber(summary.heaviest.loadKg)} kg x ${summary.heaviest.reps}`,
                                hint: summary.heaviest.exercise,
                            },
                        ]),
                  ...(summary.volumeKg > 0 && minutes > 0
                      ? [
                            {
                                id: 'density',
                                label: 'Density',
                                value: `${formatStrengthNumber(Math.round(summary.volumeKg / minutes))} kg/min`,
                                tip: DENSITY_HINT,
                            },
                        ]
                      : []),
              ]

    if (metrics.length === 0 && stats.length === 0) return null

    // The heaviest set carries a long exercise name, so it goes last and takes a full row on a
    // phone; a lone tile before it fills its row too.
    const heaviest = stats.find((stat) => stat.id === 'heaviest')
    const shortTiles: Tile[] = [
        ...metrics.map((metric) => ({ ...metric, testId: `metric-${metric.id}-value` })),
        ...stats.flatMap((stat) =>
            stat.id === 'heaviest' ? [] : [{ ...stat, testId: `strength-summary-${stat.id}` }]
        ),
    ]
    const tiles: Tile[] =
        heaviest === undefined
            ? shortTiles
            : [...shortTiles, { ...heaviest, testId: 'strength-summary-heaviest' }]
    const lastShortId = shortTiles.length % 2 === 1 ? shortTiles.at(-1)?.id : undefined

    return (
        <section
            data-testid="strength-summary"
            data-tone={KINDS.strength.tone}
            aria-label="Workout summary"
            className="space-y-3"
        >
            <dl
                data-testid="activity-metrics"
                className={cn('grid grid-cols-2 gap-3', desktopColumns(tiles.length))}
            >
                {tiles.map((tile) => (
                    <div
                        key={tile.id}
                        className={cn(
                            TILE,
                            'flex flex-col gap-2',
                            (tile.id === 'heaviest' || tile.id === lastShortId) &&
                                'max-md:col-span-2'
                        )}
                    >
                        <dt className="flex items-center gap-1.5">
                            <span className="eyebrow">{tile.label}</span>
                            {tile.tip !== undefined && (
                                <InfoTip
                                    label={tile.label}
                                    testId={`strength-summary-${tile.id}-info`}
                                >
                                    {tile.tip}
                                </InfoTip>
                            )}
                        </dt>
                        <dd data-testid={tile.testId} className="display text-2xl tabular-nums">
                            {tile.value}
                            {tile.detail !== undefined && (
                                <span className="ml-1 font-sans text-sm font-normal tracking-normal text-muted-foreground">
                                    {tile.detail}
                                </span>
                            )}
                        </dd>
                        {tile.hint !== undefined && (
                            <p
                                data-testid={`strength-summary-${tile.id}-hint`}
                                className="-mt-1 text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]"
                            >
                                {tile.hint}
                            </p>
                        )}
                    </div>
                ))}
            </dl>

            {(records.length > 0 || recordsKnown) && (
                <section
                    data-testid="strength-records"
                    aria-label="Records"
                    className="rounded-[var(--radius-surface)] bg-card p-5 shadow-soft md:p-6"
                >
                    <header className="flex items-center gap-2">
                        <IconTrophy className="size-5 text-plum-deep" aria-hidden="true" />
                        <h2 className="display text-xl">Records</h2>
                        {recordCount > 0 && (
                            <span
                                data-testid="strength-records-count"
                                className="rounded-full bg-ink px-2 py-0.5 text-xs font-medium text-paper tabular-nums"
                            >
                                {recordCount}
                            </span>
                        )}
                    </header>
                    {records.length === 0 ? (
                        <p
                            data-testid="strength-records-empty"
                            className="mt-3 text-sm text-muted-foreground"
                        >
                            No new records this session.
                        </p>
                    ) : (
                        <ul className="mt-2 grid md:grid-cols-2 md:gap-x-10">
                            {records.map((record, index) => (
                                <li
                                    key={record.key}
                                    data-testid={`strength-record-${index + 1}`}
                                    className="space-y-2 border-t border-hairline py-4 first:border-t-0 md:[&:nth-child(2)]:border-t-0"
                                >
                                    <p
                                        data-testid={`strength-record-${index + 1}-name`}
                                        className="text-[15px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]"
                                    >
                                        {record.exercise}
                                    </p>
                                    <ul className="grid gap-1.5">
                                        {record.kinds.map((kind) => (
                                            <li
                                                key={kind.type}
                                                data-testid={`strength-record-${index + 1}-${kind.type}`}
                                                className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 tabular-nums"
                                            >
                                                <span className="min-w-20 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                                                    {RECORD_LABELS[kind.type]}
                                                </span>
                                                <span
                                                    data-testid={`strength-record-${index + 1}-${kind.type}-value`}
                                                    className="text-base font-semibold text-ink"
                                                >
                                                    {formatStrengthNumber(kind.valueKg)} kg
                                                </span>
                                                {kind.setText !== null && (
                                                    <span
                                                        data-testid={`strength-record-${index + 1}-${kind.type}-set`}
                                                        className="text-xs text-muted-foreground"
                                                    >
                                                        {kind.setText}
                                                    </span>
                                                )}
                                                {kind.deltaKg !== null && (
                                                    <span
                                                        data-testid={`strength-record-${index + 1}-${kind.type}-delta`}
                                                        className="inline-flex items-center gap-0.5 rounded-full bg-green-soft px-1.5 py-0.5 text-xs font-medium text-green-deep"
                                                    >
                                                        <IconArrowUpRight
                                                            className="size-3.5"
                                                            aria-hidden="true"
                                                        />
                                                        +{formatStrengthNumber(kind.deltaKg)} kg
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </section>
    )
}
