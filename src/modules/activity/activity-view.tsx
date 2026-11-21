// oxlint-disable max-lines-per-function
import Link from 'next/link'
import { IconArrowLeft } from '@tabler/icons-react'
import { HYROX_STATION_LABELS } from '@/_bff/core/constants/hyrox.constants'
import {
    formatClock,
    formatDuration,
    formatKm,
    formatPace,
    formatPaceSeconds,
} from '@/_bff/core/utils/formatters.utils'
import type {
    ActivityDTO,
    ExerciseComparisonDTO,
    LapDTO,
    StrengthSetDTO,
} from '@/_bff/modules/training/types'
import { activityDurationS } from '@/_bff/core/utils/activity-time.utils'
import { Button } from '@/components/ui/button'
import { longDateLabel } from '@/modules/calendar/date-utils'
import { KINDS } from '@/modules/calendar/kinds'
import { cn } from '@/lib/utils'
import { toRunSplits } from '@/modules/activity/run-chart-utils'
import { RunSplits } from '@/modules/activity/run-splits'
import { StrengthExercises } from '@/modules/activity/strength-exercises'
import { StrengthSummary } from '@/modules/activity/strength-summary'
import {
    findRecords,
    formatStrengthNumber,
    recordsAreKnown,
} from '@/modules/activity/strength-utils'

type Props = {
    activity: ActivityDTO
    laps: LapDTO[]
    strengthSets: StrengthSetDTO[]
    strengthComparisons?: ExerciseComparisonDTO[]
}

type Metric = {
    id: string
    label: string
    value: string | null
    // Second line under the value on a phone (strength summary only).
    detail?: string
}

const DASH = '-'

// Prefers the stored speed, else derives it from distance and time.
const paceOf = (speed: number | null, distanceM: number | null, timeS: number | null) =>
    formatPace(speed ?? (distanceM && timeS ? distanceM / timeS : null))

function calculateTotalVolumeKgReps(sets: StrengthSetDTO[]): number | null {
    if (sets.length === 0) return null

    let total = 0
    for (const set of sets) {
        if (set.reps === null || set.loadKg === null) return null
        total += set.reps * set.loadKg
    }
    return total
}

export function ActivityView({ activity, laps, strengthSets, strengthComparisons = [] }: Props) {
    const { Icon, tone, label } = KINDS[activity.category]
    const timeS = activityDurationS(activity)
    const isStrengthActivity = activity.category === 'strength'
    const isRun = activity.category === 'run'
    const totalVolumeKgReps =
        activity.lyftaTotalVolumeKgReps ?? calculateTotalVolumeKgReps(strengthSets)

    const records = isStrengthActivity
        ? findRecords({ source: activity.source, strengthSets, comparisons: strengthComparisons })
        : []

    const fastestSplit =
        isRun && laps.length > 0
            ? toRunSplits(laps).reduce<ReturnType<typeof toRunSplits>[number] | null>(
                  (best, split) =>
                      best === null || split.paceSPerKm < best.paceSPerKm ? split : best,
                  null
              )
            : null

    const metrics: Metric[] = [
        {
            id: 'time',
            label: isStrengthActivity ? 'Duration' : 'Time',
            value: formatDuration(timeS),
        },
        ...(isStrengthActivity
            ? [
                  {
                      id: 'volume',
                      label: 'Total volume',
                      value:
                          totalVolumeKgReps === null
                              ? null
                              : `${formatStrengthNumber(totalVolumeKgReps)} kg`,
                      detail: ' x reps',
                  },
                  {
                      id: 'body-weight',
                      label: 'Body weight',
                      value:
                          activity.bodyWeightKg === null
                              ? null
                              : `${formatStrengthNumber(activity.bodyWeightKg)} kg`,
                  },
                  {
                      id: 'calories',
                      label: 'Calories',
                      value: activity.calories ? `${Math.round(activity.calories)} kcal` : null,
                  },
              ]
            : [
                  { id: 'distance', label: 'Distance', value: formatKm(activity.distanceM) },
                  {
                      id: 'pace',
                      label: 'Avg pace',
                      value: paceOf(activity.avgSpeedMps, activity.distanceM, timeS),
                  },
              ]),
        ...(fastestSplit
            ? [
                  {
                      id: 'fastest-split',
                      label: 'Fastest split',
                      value: formatPaceSeconds(fastestSplit.paceSPerKm),
                  },
              ]
            : []),
        {
            id: 'avg-hr',
            label: 'Avg heart rate',
            value: activity.avgHr ? `${Math.round(activity.avgHr)} bpm` : null,
        },
        {
            id: 'max-hr',
            label: 'Max heart rate',
            value: activity.maxHr ? `${Math.round(activity.maxHr)} bpm` : null,
        },
        {
            id: 'effort',
            label: 'Effort',
            value: activity.perceivedEffort ? `${activity.perceivedEffort} / 10` : null,
        },
    ]
    const present = metrics.filter((metric) => metric.value !== null)

    return (
        <>
            <Button
                variant="outline"
                nativeButton={false}
                className="h-11! md:h-8! w-fit gap-2 px-4"
                render={
                    <Link
                        href="/calendar"
                        data-testid="activity-back-to-calendar"
                        aria-label="Back to calendar"
                    />
                }
            >
                <IconArrowLeft aria-hidden="true" /> Back
            </Button>

            <header data-tone={tone} className="space-y-2">
                <p className="flex items-center gap-2 text-sm">
                    <span className="flex items-center gap-1 rounded-full bg-tone-soft px-2.5 py-1 text-xs font-medium text-tone-deep">
                        <Icon className="size-3.5" /> {label}
                    </span>
                    <span className="text-muted-foreground">
                        {longDateLabel(activity.localDate)}
                    </span>
                </p>
                <h1 data-testid="activity-name" className="display display-section">
                    {activity.name}
                </h1>
            </header>

            {isStrengthActivity ? (
                <StrengthSummary
                    metrics={present.flatMap(({ id, label, value, detail }) =>
                        value === null ? [] : [{ id, label, value, detail }]
                    )}
                    strengthSets={strengthSets}
                    durationS={timeS}
                    records={records}
                    recordsKnown={recordsAreKnown(activity.source, strengthComparisons)}
                />
            ) : (
                <dl
                    data-testid="activity-metrics"
                    className={cn(
                        'grid grid-cols-2 gap-3 sm:grid-cols-3',
                        present.length === 5 && 'lg:grid-cols-5',
                        present.length === 4 && 'sm:grid-cols-4'
                    )}
                >
                    {present.map((metric) => (
                        <div
                            key={metric.id}
                            className="rounded-[var(--radius-surface-inner)] border border-ink/10 bg-card p-4 max-sm:last:odd:col-span-2"
                        >
                            <dt className="eyebrow text-muted-foreground">{metric.label}</dt>
                            <dd
                                data-testid={`metric-${metric.id}-value`}
                                className="display mt-1 text-2xl"
                            >
                                {metric.value}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}

            {isRun && laps.length > 0 && <RunSplits laps={laps} />}

            {!isRun && laps.length > 0 && (
                <section aria-label="Laps" className="space-y-3">
                    <h2 className="display text-3xl">Laps</h2>
                    <div className="overflow-x-auto rounded-[var(--radius-surface-inner)] border border-ink/10 bg-card">
                        <table data-testid="laps-table" className="w-full text-sm">
                            <thead className="eyebrow text-left text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-2">Lap</th>
                                    <th className="px-4 py-2">Segment</th>
                                    <th className="px-4 py-2">Time</th>
                                    <th className="px-4 py-2">Pace</th>
                                    <th className="px-4 py-2">Heart rate</th>
                                </tr>
                            </thead>
                            <tbody className="font-mono">
                                {laps.map((lap) => {
                                    const lapTimeS = lap.movingTimeS ?? lap.elapsedTimeS

                                    return (
                                        <tr key={lap.lapIndex} className="border-t border-hairline">
                                            <td className="px-4 py-2">{lap.lapIndex}</td>
                                            <td
                                                data-testid={`lap-${lap.lapIndex}-${lap.station ? 'station' : 'segment'}`}
                                                className="px-4 py-2 font-sans"
                                            >
                                                {lap.station ? (
                                                    <span className="rounded-full bg-tangerine-soft px-2 py-0.5 text-xs text-tangerine-deep">
                                                        {HYROX_STATION_LABELS[lap.station]}
                                                    </span>
                                                ) : (
                                                    (formatKm(lap.distanceM) ?? DASH)
                                                )}
                                            </td>
                                            <td
                                                data-testid={`lap-${lap.lapIndex}-time`}
                                                className="px-4 py-2"
                                            >
                                                {formatClock(lapTimeS) ?? DASH}
                                            </td>
                                            <td
                                                data-testid={`lap-${lap.lapIndex}-pace`}
                                                className="px-4 py-2"
                                            >
                                                {(lap.station
                                                    ? null
                                                    : paceOf(
                                                          lap.avgSpeedMps,
                                                          lap.distanceM,
                                                          lapTimeS
                                                      )) ?? DASH}
                                            </td>
                                            <td
                                                data-testid={`lap-${lap.lapIndex}-hr`}
                                                className="px-4 py-2"
                                            >
                                                {lap.avgHr ? `${Math.round(lap.avgHr)} bpm` : DASH}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {isStrengthActivity ? (
                <StrengthExercises
                    strengthSets={strengthSets}
                    comparisons={strengthComparisons}
                    records={records}
                />
            ) : (
                strengthSets.length > 0 && (
                    <section aria-label="Strength sets" className="space-y-3">
                        <h2 className="display text-3xl">Strength sets</h2>
                        <div className="overflow-x-auto rounded-[var(--radius-surface-inner)] border border-ink/10 bg-card">
                            <table data-testid="strength-sets-table" className="w-full text-sm">
                                <thead className="eyebrow text-left text-muted-foreground">
                                    <tr>
                                        <th className="px-4 py-2">Exercise</th>
                                        <th className="px-4 py-2">Set</th>
                                        <th className="px-4 py-2">Reps</th>
                                        <th className="px-4 py-2">Load</th>
                                    </tr>
                                </thead>
                                <tbody className="font-mono">
                                    {strengthSets.map((set, index) => (
                                        <tr
                                            key={`${set.exercise}-${set.setIndex}-${index}`}
                                            className="border-t border-hairline"
                                        >
                                            <td
                                                data-testid={`strength-set-${index + 1}-exercise`}
                                                className="px-4 py-2 font-sans"
                                            >
                                                {set.exercise}
                                            </td>
                                            <td
                                                data-testid={`strength-set-${index + 1}-index`}
                                                className="px-4 py-2"
                                            >
                                                {set.setIndex}
                                            </td>
                                            <td
                                                data-testid={`strength-set-${index + 1}-reps`}
                                                className="px-4 py-2"
                                            >
                                                {set.reps ?? DASH}
                                            </td>
                                            <td
                                                data-testid={`strength-set-${index + 1}-load`}
                                                className="px-4 py-2"
                                            >
                                                {set.loadKg === null ? DASH : `${set.loadKg} kg`}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )
            )}
        </>
    )
}
