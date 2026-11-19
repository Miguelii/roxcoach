import Link from 'next/link'
import { IconAlertTriangle, IconCheck, IconFlag } from '@tabler/icons-react'
import { formatDuration } from '@/_bff/core/utils/formatters.utils'
import { KINDS } from '@/modules/calendar/kinds'
import { TODAY } from '@/modules/mock/data'
import type { CalendarItem } from '@/modules/mock/types'
import { cn } from '@/lib/utils'

type Props = {
    item: CalendarItem
    onSelect: () => void
}

const BASE =
    'flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight'

/** One calendar entry. Done work is filled, planned work is dashed, races are amber with a flag. */
export function CalendarChip({ item, onSelect }: Props) {
    if (item.type === 'race') {
        return (
            <Link
                href="/races"
                data-tone="amber"
                onClick={(event) => event.stopPropagation()}
                className={cn(BASE, 'bg-tone font-semibold text-tone-ink')}
            >
                <IconFlag className="size-3 shrink-0" />
                <span className="truncate">{item.race.name}</span>
                <span className="ml-auto font-mono">{item.race.priority}</span>
            </Link>
        )
    }

    if (item.type === 'activity') {
        const { activity } = item
        const { Icon, tone } = KINDS[activity.category]

        return (
            <Link
                href={`/activities/${activity.id}`}
                data-tone={tone}
                onClick={(event) => event.stopPropagation()}
                className={cn(BASE, 'bg-tone-soft text-tone-deep hover:brightness-95')}
            >
                <Icon className="size-3 shrink-0" />
                <span className="truncate">{activity.name}</span>
                <span className="ml-auto flex shrink-0 items-center gap-0.5 whitespace-nowrap font-mono">
                    {formatDuration(activity.durationS)}
                    <IconCheck className="size-3" aria-label="Done" />
                </span>
            </Link>
        )
    }

    const { session } = item
    const { Icon, tone } = KINDS[session.kind]
    const isMissed = session.status === 'planned' && session.date < TODAY
    const isSkipped = session.status === 'skipped'

    return (
        <button
            type="button"
            data-tone={isMissed ? 'amber' : tone}
            onClick={(event) => {
                event.stopPropagation()
                onSelect()
            }}
            className={cn(
                BASE,
                'border border-dashed border-tone/60 text-tone-deep hover:bg-tone-soft/60',
                isMissed && 'border-solid bg-tone-soft',
                isSkipped && 'opacity-50'
            )}
        >
            {isMissed ? (
                <IconAlertTriangle className="size-3 shrink-0" />
            ) : (
                <Icon className="size-3 shrink-0" />
            )}
            <span className={cn('truncate', isSkipped && 'line-through')}>{session.title}</span>
            <span className="ml-auto font-mono">
                {isMissed ? 'Missed' : isSkipped ? 'Skipped' : `${session.targetMinutes}m`}
            </span>
        </button>
    )
}
