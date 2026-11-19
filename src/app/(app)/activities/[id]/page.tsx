import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IconArrowLeft, IconExternalLink } from '@tabler/icons-react'
import { HYROX_STATION_LABELS } from '@/_bff/core/constants/hyrox.constants'
import {
    formatClock,
    formatDuration,
    formatKm,
    formatPace,
} from '@/_bff/core/utils/formatters.utils'
import { ActivityDetailsDialog } from '@/modules/activity/activity-details-dialog'
import { longDateLabel } from '@/modules/calendar/date-utils'
import { KINDS } from '@/modules/calendar/kinds'
import { getLaps } from '@/modules/mock/coach-mock'
import { ACTIVITIES, getActivity } from '@/modules/mock/data'

type Props = PageProps<'/activities/[id]'>

export const metadata: Metadata = { title: 'Activity' }

export const generateStaticParams = () => ACTIVITIES.map((activity) => ({ id: activity.id }))

export default async function ActivityPage({ params }: Props) {
    const { id } = await params
    const activity = getActivity(id)
    if (!activity) notFound()

    const { Icon, tone, label } = KINDS[activity.category]
    const laps = getLaps(activity)
    const speed = activity.distanceM ? activity.distanceM / activity.durationS : null

    const metrics = [
        { label: 'Time', value: formatDuration(activity.durationS) },
        { label: 'Distance', value: formatKm(activity.distanceM) },
        { label: 'Avg pace', value: formatPace(speed) },
        { label: 'Avg heart rate', value: activity.avgHr ? `${activity.avgHr} bpm` : null },
        { label: 'Effort', value: activity.rpe ? `${activity.rpe} / 10` : null },
    ].filter((metric) => metric.value !== null)

    return (
        <main className="main-container">
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
                    <span className="text-muted-foreground">{longDateLabel(activity.date)}</span>
                </p>
                <h1 className="display display-section">{activity.name}</h1>
                {activity.source === 'strava' ? (
                    <a
                        href="https://www.strava.com"
                        className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
                    >
                        View on Strava <IconExternalLink className="size-3.5" />
                    </a>
                ) : (
                    <p className="text-sm text-muted-foreground">Logged by hand</p>
                )}
            </header>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {metrics.map((metric) => (
                    <div
                        key={metric.label}
                        className="rounded-[var(--radius-surface-inner)] border border-ink/10 bg-card p-4"
                    >
                        <dt className="eyebrow text-muted-foreground">{metric.label}</dt>
                        <dd className="display mt-1 text-2xl">{metric.value}</dd>
                    </div>
                ))}
            </dl>

            {laps.length > 0 && (
                <section aria-label="Laps" className="space-y-3">
                    <div className="flex items-center gap-3">
                        <h2 className="display text-3xl">Laps</h2>
                        <div className="ml-auto">
                            <ActivityDetailsDialog category={activity.category} />
                        </div>
                    </div>
                    <div className="overflow-x-auto rounded-[var(--radius-surface-inner)] border border-ink/10 bg-card">
                        <table className="w-full text-sm">
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
                                {laps.map((lap) => (
                                    <tr key={lap.index} className="border-t border-hairline">
                                        <td className="px-4 py-2">{lap.index}</td>
                                        <td className="px-4 py-2 font-sans">
                                            {lap.station ? (
                                                <span className="rounded-full bg-tangerine-soft px-2 py-0.5 text-xs text-tangerine-deep">
                                                    {HYROX_STATION_LABELS[lap.station]}
                                                </span>
                                            ) : (
                                                formatKm(lap.distanceM)
                                            )}
                                        </td>
                                        <td className="px-4 py-2">{formatClock(lap.timeS)}</td>
                                        <td className="px-4 py-2">
                                            {lap.station
                                                ? '-'
                                                : formatPace(lap.distanceM / lap.timeS)}
                                        </td>
                                        <td className="px-4 py-2">{lap.avgHr} bpm</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {laps.length === 0 && <ActivityDetailsDialog category={activity.category} />}
        </main>
    )
}
