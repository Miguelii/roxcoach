'use client'

import Link from 'next/link'
import { Match } from 'effect'
import { IconArrowRight, IconFlag } from '@tabler/icons-react'
import { formatClock, formatDuration, formatKm } from '@/_bff/core/utils/formatters.utils'
import type { CalendarItem } from '@/_bff/modules/training/types'
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer'
import { activityDurationS } from '@/_bff/core/utils/activity-time.utils'
import { longDateLabel } from '@/modules/calendar/date-utils'
import { getItemKey } from '@/modules/calendar/item-key'
import { KINDS } from '@/modules/calendar/kinds'

type Props = {
    date: string | null
    items: CalendarItem[]
    onClose: () => void
}

type ItemProps = {
    item: CalendarItem
}

type ActivityProps = {
    activity: Extract<CalendarItem, { type: 'activity' }>['activity']
}

type RaceProps = {
    race: Extract<CalendarItem, { type: 'race' }>['race']
}

function RacePanelItem({ race }: RaceProps) {
    return (
        <Link
            href="/races"
            data-testid={`day-panel-race-${race.id}`}
            data-tone="amber"
            className="block rounded-2xl bg-tone-soft p-4 text-tone-deep transition hover:brightness-95"
        >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase">
                <IconFlag className="size-4" /> Race
                <span data-testid={`day-panel-race-${race.id}-priority`}>
                    Priority {race.priority}
                </span>
                <IconArrowRight className="ml-auto size-4" />
            </div>
            <p className="mt-1 text-base font-semibold">{race.name}</p>
            <p data-testid={`day-panel-race-${race.id}-goal`} className="font-mono text-xs">
                Goal {formatClock(race.targetTimeS)}
            </p>
        </Link>
    )
}

function ActivityPanelItem({ activity }: ActivityProps) {
    const { Icon, tone, label } = KINDS[activity.category]

    return (
        <Link
            href={`/activities/${activity.id}`}
            data-testid={`day-panel-item-${activity.id}`}
            data-tone={tone}
            className="block rounded-2xl bg-tone-soft p-4 text-tone-deep transition hover:brightness-95"
        >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase">
                <Icon className="size-4" /> {label}
                <IconArrowRight className="ml-auto size-4" />
            </div>
            <p className="mt-1 text-base font-semibold">{activity.name}</p>
            <p className="font-mono text-xs">
                {[formatDuration(activityDurationS(activity)), formatKm(activity.distanceM)]
                    .filter(Boolean)
                    .join('  ·  ')}
            </p>
        </Link>
    )
}

function PanelItem({ item }: ItemProps) {
    return Match.value(item).pipe(
        Match.when({ type: 'activity' }, ({ activity }) => (
            <ActivityPanelItem activity={activity} />
        )),
        Match.when({ type: 'race' }, ({ race }) => <RacePanelItem race={race} />),
        Match.exhaustive
    )
}

export function DayPanel({ date, items, onClose }: Props) {
    return (
        <Drawer open={date !== null} onOpenChange={(open) => !open && onClose()}>
            <DrawerContent className="bg-paper">
                <DrawerHeader>
                    <DrawerTitle className="display text-3xl">
                        {date ? longDateLabel(date) : ''}
                    </DrawerTitle>
                    <DrawerDescription>
                        {items.length === 0
                            ? 'Nothing logged.'
                            : `${items.length} ${items.length === 1 ? 'entry' : 'entries'}`}
                    </DrawerDescription>
                </DrawerHeader>
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6">
                    {items.map((item) => (
                        <PanelItem key={getItemKey(item)} item={item} />
                    ))}
                    {items.length === 0 && (
                        <p className="rounded-2xl border border-dashed border-hairline-strong p-4 text-sm text-muted-foreground">
                            Rest day. Uploaded activities and races show up here.
                        </p>
                    )}
                </div>
            </DrawerContent>
        </Drawer>
    )
}
