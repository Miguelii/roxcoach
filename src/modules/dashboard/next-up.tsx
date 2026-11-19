import Link from 'next/link'
import { IconArrowRight } from '@tabler/icons-react'
import { formatClock } from '@/_bff/core/utils/formatters.utils'
import { KINDS } from '@/modules/calendar/kinds'
import { daysBetween, longDateLabel } from '@/modules/calendar/date-utils'
import { PLANNED_SESSIONS, TODAY, upcomingRaces } from '@/modules/mock/data'

export function NextUp() {
    const session = PLANNED_SESSIONS.find((item) => item.status === 'planned' && item.date >= TODAY)
    const race = upcomingRaces()[0]

    return (
        <section aria-label="Next up" className="grid gap-3 md:grid-cols-2">
            {session && (
                <div
                    data-tone={KINDS[session.kind].tone}
                    className="rounded-[var(--radius-surface)] bg-tone p-5 text-tone-ink"
                >
                    <p className="eyebrow opacity-80">
                        Next session,{' '}
                        {session.date === TODAY ? 'today' : longDateLabel(session.date)}
                    </p>
                    <h3 className="display mt-2 text-4xl">{session.title}</h3>
                    <p className="mt-1 font-mono text-xs opacity-80">
                        {KINDS[session.kind].label}, {session.targetMinutes} min
                    </p>
                    <p className="mt-3 max-w-prose text-sm">{session.description}</p>
                </div>
            )}
            {race && (
                <Link
                    href="/races"
                    data-tone="amber"
                    className="group flex flex-col justify-between rounded-[var(--radius-surface)] bg-tone-soft p-5 text-tone-deep"
                >
                    <div>
                        <p className="eyebrow">Next race</p>
                        <h3 className="mt-2 text-lg font-semibold">{race.name}</h3>
                        <p className="text-sm">
                            Goal {formatClock(race.targetS)}, priority {race.priority}
                        </p>
                    </div>
                    <div className="mt-4 flex items-end justify-between">
                        <p className="display text-6xl">
                            {daysBetween(TODAY, race.date)}
                            <span className="eyebrow ml-2">days</span>
                        </p>
                        <IconArrowRight className="size-5 transition group-hover:translate-x-1" />
                    </div>
                </Link>
            )}
        </section>
    )
}
