import Link from 'next/link'
import { IconCheck } from '@tabler/icons-react'
import { formatDuration } from '@/_bff/core/utils/formatters.utils'
import type { CalendarItem } from '@/_bff/modules/training/types'
import { activityDurationS } from '@/modules/calendar/activity-time'
import { KINDS } from '@/modules/calendar/kinds'
import { cn } from '@/lib/utils'

type Props = {
    item: CalendarItem
}

/** One completed activity on the calendar, filled with its category tone. */
export function CalendarChip({ item }: Props) {
    const { activity } = item
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
