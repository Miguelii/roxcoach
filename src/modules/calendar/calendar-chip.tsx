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
    // Taller on a phone (44 px) so it is easy to tap; the desktop size is unchanged.
    touch?: boolean
}

type ActivityProps = {
    activity: Extract<CalendarItem, { type: 'activity' }>['activity']
    touch: boolean
}

type RaceProps = {
    race: Extract<CalendarItem, { type: 'race' }>['race']
    touch: boolean
}

const TOUCH_CLASSES = 'max-md:min-h-11 max-md:gap-2 max-md:px-3 max-md:text-[13px]'

/** One race on the calendar: amber tone, flag icon (never colour alone), priority letter. */
function RaceChip({ race, touch }: RaceProps) {
    return (
        <Link
            href="/races"
            data-testid={`calendar-race-chip-${race.id}`}
            data-tone="amber"
            onClick={(event) => event.stopPropagation()}
            className={cn(
                'flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight',
                'bg-tone-soft text-tone-deep hover:brightness-95',
                touch && TOUCH_CLASSES
            )}
        >
            <IconFlag
                className={cn('size-3 shrink-0', touch && 'max-md:size-4')}
                aria-label="Race"
            />
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
function ActivityChip({ activity, touch }: ActivityProps) {
    const { Icon, tone } = KINDS[activity.category]

    return (
        <Link
            href={`/activities/${activity.id}`}
            data-testid={`calendar-chip-${activity.id}`}
            data-tone={tone}
            onClick={(event) => event.stopPropagation()}
            className={cn(
                'flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight',
                'bg-tone-soft text-tone-deep hover:brightness-95',
                touch && TOUCH_CLASSES
            )}
        >
            <Icon className={cn('size-3 shrink-0', touch && 'max-md:size-4')} />
            <span className="truncate">{activity.name}</span>
            <span className="ml-auto flex shrink-0 items-center gap-0.5 whitespace-nowrap font-mono">
                {formatDuration(activityDurationS(activity))}
                <IconCheck className={cn('size-3', touch && 'max-md:size-4')} aria-label="Done" />
            </span>
        </Link>
    )
}

/** A calendar entry: an activity or a race. */
export function CalendarChip({ item, touch = false }: Props) {
    return Match.value(item).pipe(
        Match.when({ type: 'activity' }, ({ activity }) => (
            <ActivityChip activity={activity} touch={touch} />
        )),
        Match.when({ type: 'race' }, ({ race }) => <RaceChip race={race} touch={touch} />),
        Match.exhaustive
    )
}
