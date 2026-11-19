import Link from 'next/link'
import { IconArrowLeft, IconExternalLink } from '@tabler/icons-react'
import { HYROX_STATION_LABELS } from '@/_bff/core/constants/hyrox.constants'
import {
    formatClock,
    formatDuration,
    formatKm,
    formatPace,
} from '@/_bff/core/utils/formatters.utils'
import type { ActivityDTO, LapDTO } from '@/_bff/modules/training/types'
import { activityDurationS } from '@/modules/calendar/activity-time'
import { longDateLabel } from '@/modules/calendar/date-utils'
import { KINDS } from '@/modules/calendar/kinds'

type Props = {
    activity: ActivityDTO
    laps: LapDTO[]
}

type Metric = {
    id: string
    label: string
    value: string | null
}

const DASH = '-'

// Prefers the speed Strava reports, else derives it from distance and time.
const paceOf = (speed: number | null, distanceM: number | null, timeS: number | null) =>
    formatPace(speed ?? (distanceM && timeS ? distanceM / timeS : null))

export function ActivityView({ activity, laps }: Props) {
    const { Icon, tone, label } = KINDS[activity.category]
    const timeS = activityDurationS(activity)

    const metrics: Metric[] = [
        { id: 'time', label: 'Time', value: formatDuration(timeS) },
        { id: 'distance', label: 'Distance', value: formatKm(activity.distanceM) },
        {
            id: 'pace',
            label: 'Avg pace',
            value: paceOf(activity.avgSpeedMps, activity.distanceM, timeS),
        },
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
            <Link
                href="/dashboard"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <IconArrowLeft className="size-4" /> Back to calendar
            </Link>

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
                {activity.source === 'strava' && activity.stravaId !== null ? (
                    <a
                        data-testid="strava-link"
                        href={`https://www.strava.com/activities/${activity.stravaId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
                    >
                        View on Strava <IconExternalLink className="size-3.5" />
                    </a>
                ) : (
                    <p className="text-sm text-muted-foreground">Logged by hand</p>
                )}
            </header>

            <dl
                data-testid="activity-metrics"
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
            >
                {present.map((metric) => (
                    <div
                        key={metric.id}
                        className="rounded-[var(--radius-surface-inner)] border border-ink/10 bg-card p-4"
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

            {laps.length > 0 && (
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
        </>
    )
}
