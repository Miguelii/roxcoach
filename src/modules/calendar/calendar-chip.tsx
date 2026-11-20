import Link from 'next/link'
import { Match } from 'effect'
import { IconCheck, IconFlag } from '@tabler/icons-react'
import { formatDuration } from '@/_bff/core/utils/formatters.utils'
import type { CalendarItem } from '@/_bff/modules/training/types'
import { activityDurationS } from '@/_bff/core/utils/activity-time.utils'
import { KINDS } from '@/modules/calendar/kinds'
import { cn } from '@/lib/utils'

type Props = {
    item: CalendarItem
}

type ActivityProps = {
    activity: Extract<CalendarItem, { type: 'activity' }>['activity']
}

type RaceProps = {
    race: Extract<CalendarItem, { type: 'race' }>['race']
}

/** One race on the calendar: amber tone, flag icon (never colour alone), priority letter. */
function RaceChip({ race }: RaceProps) {
    return (
        <Link
            href="/races"
            data-testid={`calendar-race-chip-${race.id}`}
            data-tone="amber"
            onClick={(event) => event.stopPropagation()}
            className={cn(
                'flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight',
                'bg-tone-soft text-tone-deep hover:brightness-95'
            )}
        >
            <IconFlag className="size-3 shrink-0" aria-label="Race" />
            <span className="truncate">{race.name}</span>
            <span
                data-testid={`calendar-race-chip-${race.id}-priority`}
                className="ml-auto shrink-0 font-mono font-semibold"
            >
                {race.priority}
            </span>
        </Link>
    )
}

/** One completed activity on the calendar, filled with its category tone. */
function ActivityChip({ activity }: ActivityProps) {
    const { Icon, tone } = KINDS[activity.category]

    return (
        <Link
            href={`/activities/${activity.id}`}
            data-testid={`calendar-chip-${activity.id}`}
            data-tone={tone}
            onClick={(event) => event.stopPropagation()}
            className={cn(
                'flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight',
                'bg-tone-soft text-tone-deep hover:brightness-95'
            )}
        >
            <Icon className="size-3 shrink-0" />
            <span className="truncate">{activity.name}</span>
            <span className="ml-auto flex shrink-0 items-center gap-0.5 whitespace-nowrap font-mono">
                {formatDuration(activityDurationS(activity))}
                <IconCheck className="size-3" aria-label="Done" />
            </span>
        </Link>
    )
}

/** A calendar entry: an activity or a race. */
export function CalendarChip({ item }: Props) {
    return Match.value(item).pipe(
        Match.when({ type: 'activity' }, ({ activity }) => <ActivityChip activity={activity} />),
        Match.when({ type: 'race' }, ({ race }) => <RaceChip race={race} />),
        Match.exhaustive
    )
}
