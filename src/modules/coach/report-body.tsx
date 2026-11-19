import Link from 'next/link'
import {
    IconAlertTriangle,
    IconArrowRight,
    IconCheck,
    IconCircleDashed,
    IconTrendingDown,
} from '@tabler/icons-react'
import { shortDateLabel } from '@/modules/calendar/date-utils'
import type { WeeklyReport } from '@/modules/mock/coach-mock'
import { cn } from '@/lib/utils'

type Props = {
    report: WeeklyReport
}

type FollowUpStatus = WeeklyReport['followUps'][number]['status']

const FOLLOW_UP_STYLES: Record<FollowUpStatus, { label: string; className: string }> = {
    resolved: { label: 'Resolved', className: 'bg-green-soft text-green-deep' },
    open: { label: 'Still open', className: 'bg-amber-soft text-amber-deep' },
    worse: { label: 'Worse', className: 'bg-tangerine-soft text-tangerine-deep' },
}

const FOLLOW_UP_ICONS = {
    resolved: IconCheck,
    open: IconCircleDashed,
    worse: IconTrendingDown,
} as const

export function ReportBody({ report }: Props) {
    const metrics = [
        { label: 'Time', value: report.metrics.time },
        { label: 'Sessions', value: report.metrics.sessions },
        { label: 'Run distance', value: report.metrics.runKm },
        { label: 'Load', value: report.metrics.load },
    ]

    return (
        <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {metrics.map((metric) => (
                    <div
                        key={metric.label}
                        className="rounded-[var(--radius-surface-inner)] bg-muted/60 p-3"
                    >
                        <dt className="eyebrow text-muted-foreground">{metric.label}</dt>
                        <dd className="mt-1 text-base font-semibold">{metric.value}</dd>
                    </div>
                ))}
            </dl>

            <p className="max-w-3xl text-sm leading-relaxed">{report.summary}</p>

            <div className="grid gap-6 md:grid-cols-2">
                <div>
                    <h3 className="eyebrow text-muted-foreground">Went well</h3>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                        {report.wentWell.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </div>
                <div>
                    <h3 className="eyebrow text-muted-foreground">Watch out</h3>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                        {report.watchOut.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </div>
            </div>

            {report.followUps.length > 0 && (
                <div>
                    <h3 className="eyebrow text-muted-foreground">
                        Follow-ups from earlier reports
                    </h3>
                    <ul className="mt-2 divide-y divide-hairline rounded-[var(--radius-surface-inner)] border border-ink/10">
                        {report.followUps.map((followUp) => {
                            const style = FOLLOW_UP_STYLES[followUp.status]
                            const Icon = FOLLOW_UP_ICONS[followUp.status]

                            return (
                                <li
                                    key={followUp.topic}
                                    className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-sm"
                                >
                                    <span
                                        className={cn(
                                            'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                                            style.className
                                        )}
                                    >
                                        <Icon className="size-3" /> {style.label}
                                    </span>
                                    <span className="font-medium">{followUp.topic}</span>
                                    <span className="basis-full text-muted-foreground sm:basis-auto">
                                        {followUp.note}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            )}

            <div className="rounded-[var(--radius-surface-inner)] bg-ink p-4 text-primary-foreground">
                <p className="eyebrow opacity-70">Next week focus</p>
                <p className="mt-1 text-sm">{report.nextWeekFocus}</p>
                <Link
                    href="/plan"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                >
                    See next week&apos;s sessions <IconArrowRight className="size-4" />
                </Link>
            </div>

            <div>
                <h3 className="eyebrow text-muted-foreground">Race outlook</h3>
                <ul className="mt-2 space-y-2">
                    {report.raceOutlook.map((race) => (
                        <li
                            key={race.raceId}
                            data-tone="amber"
                            className="rounded-[var(--radius-surface-inner)] bg-tone-soft px-4 py-3 text-sm text-tone-deep"
                        >
                            <span className="font-semibold">{race.name}. </span>
                            {race.note}
                        </li>
                    ))}
                </ul>
            </div>

            {report.goalCheck && (
                <div
                    data-tone="amber"
                    className="flex gap-2 rounded-[var(--radius-surface-inner)] border border-tone/40 p-3 text-sm text-tone-deep"
                >
                    <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <p>
                        <span className="font-semibold">Goal check. </span>
                        {report.goalCheck}
                    </p>
                </div>
            )}

            <p className="font-mono text-xs text-muted-foreground">
                Written {shortDateLabel(report.generatedOn)}, 20:00. Remembers{' '}
                {report.memoryIds.length} earlier{' '}
                {report.memoryIds.length === 1 ? 'report' : 'reports'}.
            </p>
        </div>
    )
}
