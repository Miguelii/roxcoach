'use client'

import Link from 'next/link'
import { IconArrowRight, IconDots } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    isoWeekNumber,
    isoWeekday,
    longDateLabel,
    shortDateLabel,
    startOfWeek,
    WEEKDAY_LABELS,
} from '@/modules/calendar/date-utils'
import { KINDS } from '@/modules/calendar/kinds'
import { LATEST_REPORT, NEXT_REPORT_DATE } from '@/modules/mock/coach-mock'
import { PLANNED_SESSIONS, TODAY } from '@/modules/mock/data'
import type { MockPlannedSession } from '@/modules/mock/types'
import { cn } from '@/lib/utils'

type WeekGroup = {
    start: string
    sessions: MockPlannedSession[]
}

type RowProps = {
    session: MockPlannedSession
}

const groupByWeek = (sessions: MockPlannedSession[]) => {
    const groups = new Map<string, WeekGroup>()

    for (const session of sessions) {
        const start = startOfWeek(session.date)
        const group = groups.get(start) ?? { start, sessions: [] }
        group.sessions.push(session)
        groups.set(start, group)
    }

    return [...groups.values()]
}

function SessionRow({ session }: RowProps) {
    const { Icon, tone, label } = KINDS[session.kind]
    const done = session.status === 'done'
    const skipped = session.status === 'skipped'

    return (
        <li
            data-tone={tone}
            className={cn(
                'grid grid-cols-[3rem_1fr_auto] items-start gap-3 border-t border-hairline px-4 py-3 first:border-t-0',
                skipped && 'opacity-50'
            )}
        >
            <div className="font-mono text-xs text-muted-foreground">
                <p>{WEEKDAY_LABELS[isoWeekday(session.date) - 1]}</p>
                <p>{shortDateLabel(session.date)}</p>
            </div>
            <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className="flex items-center gap-1 rounded-full bg-tone-soft px-2 py-0.5 text-xs font-medium text-tone-deep">
                        <Icon className="size-3" /> {label}
                    </span>
                    <span className={cn(skipped && 'line-through')}>{session.title}</span>
                    <span className="font-mono text-xs font-normal text-muted-foreground">
                        {session.targetMinutes} min
                    </span>
                    {done && (
                        <span className="rounded-full bg-green-soft px-2 py-0.5 text-xs font-medium text-green-deep">
                            Done
                        </span>
                    )}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{session.description}</p>
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon" aria-label="Session actions" />}
                >
                    <IconDots />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => toast('Mockup: marked as done')}>
                        Mark done
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast('Mockup: skipped')}>
                        Skip
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast('Mockup: pick a new day')}>
                        Move to another day
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </li>
    )
}

export function PlanView() {
    const groups = groupByWeek(
        PLANNED_SESSIONS.filter((session) => session.date >= startOfWeek(TODAY))
    )

    return (
        <div className="space-y-6">
            {LATEST_REPORT && (
                <section className="rounded-[var(--radius-surface)] border border-ink/10 bg-card p-5">
                    <p className="eyebrow text-muted-foreground">
                        From the coach report of {shortDateLabel(LATEST_REPORT.generatedOn)}
                    </p>
                    <p className="mt-2 text-lg font-semibold leading-snug">
                        {LATEST_REPORT.nextWeekFocus}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        The coach writes one week at a time. Next report:{' '}
                        {longDateLabel(NEXT_REPORT_DATE)}, 20:00.
                    </p>
                    <Link
                        href="/coach"
                        className="mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                    >
                        Read the report <IconArrowRight className="size-4" />
                    </Link>
                </section>
            )}

            {groups.map((group) => {
                const minutes = group.sessions.reduce(
                    (sum, session) =>
                        sum + (session.status === 'skipped' ? 0 : session.targetMinutes),
                    0
                )
                const isCurrent = group.start === startOfWeek(TODAY)

                return (
                    <section key={group.start} aria-label={`Week ${isoWeekNumber(group.start)}`}>
                        <div className="mb-2 flex items-baseline gap-3">
                            <h2 className="text-base font-semibold">
                                Week {isoWeekNumber(group.start)}
                            </h2>
                            <p className="font-mono text-xs text-muted-foreground">
                                {shortDateLabel(group.start)},{' '}
                                {Math.round((minutes / 60) * 10) / 10} h
                            </p>
                            <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] text-primary-foreground">
                                {isCurrent ? 'This week' : 'Next week'}
                            </span>
                        </div>
                        <ul className="overflow-hidden rounded-[var(--radius-surface-inner)] border border-ink/10 bg-card">
                            {group.sessions.map((session) => (
                                <SessionRow key={session.id} session={session} />
                            ))}
                        </ul>
                    </section>
                )
            })}

            {LATEST_REPORT && (
                <section aria-label="Race outlook" className="space-y-3">
                    <h2 className="display text-3xl">Outlook</h2>
                    <p className="text-sm text-muted-foreground">
                        Provisional. It is rewritten every Sunday and is not scheduled day by day.
                    </p>
                    <div className="grid gap-3 md:grid-cols-3">
                        {LATEST_REPORT.raceOutlook.map((race) => (
                            <div
                                key={race.raceId}
                                data-tone="amber"
                                className="rounded-[var(--radius-surface-inner)] bg-tone-soft p-4 text-sm text-tone-deep"
                            >
                                <p className="font-semibold">{race.name}</p>
                                <p className="mt-1">{race.note}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}
