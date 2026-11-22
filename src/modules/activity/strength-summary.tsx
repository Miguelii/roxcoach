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
    // Second line under the value on a phone, inline from `sm` up.
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

type Stat = {
    id: string
    label: string
    value: string
    // Secondary line under the value.
    hint?: string
    // Explanation shown by the info button next to the label.
    tip?: string
}

const ROW_DIVIDER = 'border-t border-hairline pt-4'

// The whole workout in one card: the headline numbers, what was done (exercises, sets, reps, the
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

    const stats: Stat[] =
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
    const shortStats = stats.filter((stat) => stat.id !== 'heaviest')

    if (metrics.length === 0 && stats.length === 0) return null

    return (
        <section
            data-testid="strength-summary"
            data-tone={KINDS.strength.tone}
            aria-label="Workout summary"
        >
            <div className="space-y-4 rounded-[var(--radius-surface)] bg-card p-5 shadow-soft">
                {metrics.length > 0 && (
                    <dl
                        data-testid="activity-metrics"
                        className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4"
                    >
                        {metrics.map((metric) => (
                            <div key={metric.id} className="min-w-0">
                                <dt className="eyebrow text-muted-foreground">{metric.label}</dt>
                                <dd
                                    data-testid={`metric-${metric.id}-value`}
                                    className="mt-1 font-mono text-lg tabular-nums"
                                >
                                    {metric.value}
                                    {metric.detail !== undefined && (
                                        <span className="block text-xs text-muted-foreground sm:inline sm:text-lg sm:text-foreground">
                                            {metric.detail}
                                        </span>
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}

                {stats.length > 0 && (
                    <dl
                        className={cn(
                            'grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 md:grid-cols-5',
                            metrics.length > 0 && ROW_DIVIDER
                        )}
                    >
                        {stats.map((stat) => (
                            <div
                                key={stat.id}
                                className={cn(
                                    'min-w-0',
                                    // On a phone the heaviest set (it carries a long exercise name)
                                    // goes last in full width, and a lone short stat before it fills
                                    // its row.
                                    stat.id === 'heaviest' && 'max-sm:order-1 max-sm:col-span-2',
                                    stat.id === shortStats.at(-1)?.id &&
                                        shortStats.length % 2 === 1 &&
                                        'max-sm:col-span-2'
                                )}
                            >
                                <dt className="eyebrow flex items-center gap-1.5 text-muted-foreground">
                                    {stat.label}
                                    {stat.tip !== undefined && (
                                        <InfoTip
                                            label={stat.label}
                                            testId={`strength-summary-${stat.id}-info`}
                                        >
                                            {stat.tip}
                                        </InfoTip>
                                    )}
                                </dt>
                                <dd
                                    data-testid={`strength-summary-${stat.id}`}
                                    className="mt-1 font-mono text-lg tabular-nums"
                                >
                                    {stat.value}
                                </dd>
                                {stat.hint !== undefined && (
                                    <p
                                        data-testid={`strength-summary-${stat.id}-hint`}
                                        className="mt-0.5 text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]"
                                    >
                                        {stat.hint}
                                    </p>
                                )}
                            </div>
                        ))}
                    </dl>
                )}

                {(records.length > 0 || recordsKnown) && (
                    <section
                        data-testid="strength-records"
                        aria-label="Records"
                        className={cn('space-y-3', ROW_DIVIDER)}
                    >
                        <p className="flex items-center gap-2">
                            <span className="eyebrow text-muted-foreground">Records</span>
                            {recordCount > 0 && (
                                <span
                                    data-testid="strength-records-count"
                                    className="rounded-full bg-ink px-2 py-0.5 text-xs font-medium text-paper tabular-nums"
                                >
                                    {recordCount}
                                </span>
                            )}
                        </p>
                        {records.length === 0 ? (
                            <p
                                data-testid="strength-records-empty"
                                className="text-sm text-muted-foreground"
                            >
                                No new records this session.
                            </p>
                        ) : (
                            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {records.map((record, index) => (
                                    <li
                                        key={record.key}
                                        data-testid={`strength-record-${index + 1}`}
                                        className="flex items-start gap-3 rounded-[var(--radius-surface-inner)] bg-paper px-3.5 py-3"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tone-soft text-tone-deep"
                                        >
                                            <IconTrophy className="size-4" />
                                        </span>
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            <p
                                                data-testid={`strength-record-${index + 1}-name`}
                                                className="pt-1 text-sm font-semibold leading-snug text-ink [overflow-wrap:anywhere]"
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
                                                                +
                                                                {formatStrengthNumber(kind.deltaKg)}{' '}
                                                                kg
                                                            </span>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}
            </div>
        </section>
    )
}
