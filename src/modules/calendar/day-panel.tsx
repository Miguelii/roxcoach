'use client'

import Link from 'next/link'
import { IconArrowRight, IconFlag, IconPlus } from '@tabler/icons-react'
import { toast } from 'sonner'
import { formatClock, formatDuration, formatKm } from '@/_bff/core/utils/formatters.utils'
import { Button } from '@/components/ui/button'
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer'
import { useIsMobile } from '@/hooks/use-mobile'
import { longDateLabel } from '@/modules/calendar/date-utils'
import { getItemKey } from '@/modules/calendar/item-key'
import { KINDS } from '@/modules/calendar/kinds'
import { itemsOn, TODAY } from '@/modules/mock/data'
import type { CalendarItem } from '@/modules/mock/types'
import { cn } from '@/lib/utils'

type Props = {
    date: string | null
    onClose: () => void
    onLogSession: (date: string) => void
}

type ItemProps = {
    item: CalendarItem
}

function PanelItem({ item }: ItemProps) {
    if (item.type === 'race') {
        const { race } = item
        return (
            <div data-tone="amber" className="rounded-2xl bg-tone p-4 text-tone-ink">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase">
                    <IconFlag className="size-4" /> Race, priority {race.priority}
                </div>
                <p className="mt-1 text-base font-semibold">{race.name}</p>
                <p className="text-sm">Goal {formatClock(race.targetS)}</p>
            </div>
        )
    }

    if (item.type === 'activity') {
        const { activity } = item
        const { Icon, tone, label } = KINDS[activity.category]
        return (
            <Link
                href={`/activities/${activity.id}`}
                data-tone={tone}
                className="block rounded-2xl bg-tone-soft p-4 text-tone-deep transition hover:brightness-95"
            >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase">
                    <Icon className="size-4" /> {label}, done
                    <IconArrowRight className="ml-auto size-4" />
                </div>
                <p className="mt-1 text-base font-semibold">{activity.name}</p>
                <p className="font-mono text-xs">
                    {[formatDuration(activity.durationS), formatKm(activity.distanceM)]
                        .filter(Boolean)
                        .join('  ·  ')}
                </p>
            </Link>
        )
    }

    const { session } = item
    const { Icon, tone, label } = KINDS[session.kind]
    const isMissed = session.status === 'planned' && session.date < TODAY

    return (
        <div
            data-tone={isMissed ? 'amber' : tone}
            className={cn(
                'rounded-2xl border border-dashed border-tone/60 p-4 text-tone-deep',
                isMissed && 'border-solid bg-tone-soft'
            )}
        >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase">
                <Icon className="size-4" /> {label},{' '}
                {isMissed ? 'missed' : session.status === 'skipped' ? 'skipped' : 'planned'}
            </div>
            <p className="mt-1 text-base font-semibold">{session.title}</p>
            <p className="font-mono text-xs">{session.targetMinutes} min</p>
            <p className="mt-2 text-sm text-ink">{session.description}</p>
            {session.status === 'planned' && (
                <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toast('Mockup: marked as done')}
                    >
                        Mark done
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toast('Mockup: skipped')}>
                        Skip
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toast('Mockup: move session')}>
                        Move
                    </Button>
                </div>
            )}
        </div>
    )
}

export function DayPanel({ date, onClose, onLogSession }: Props) {
    const isMobile = useIsMobile()
    const items = date ? itemsOn(date) : []

    return (
        <Drawer
            open={date !== null}
            onOpenChange={(open) => !open && onClose()}
            direction={isMobile ? 'bottom' : 'right'}
        >
            <DrawerContent className="bg-paper">
                <DrawerHeader>
                    <DrawerTitle className="display text-3xl">
                        {date ? longDateLabel(date) : ''}
                    </DrawerTitle>
                    <DrawerDescription>
                        {items.length === 0
                            ? 'Nothing planned or logged.'
                            : `${items.length} ${items.length === 1 ? 'entry' : 'entries'}`}
                    </DrawerDescription>
                </DrawerHeader>
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6">
                    {items.map((item) => (
                        <PanelItem key={getItemKey(item)} item={item} />
                    ))}
                    {items.length === 0 && (
                        <p className="rounded-2xl border border-dashed border-hairline-strong p-4 text-sm text-muted-foreground">
                            Rest day. Log a session if you trained anyway.
                        </p>
                    )}
                    <Button
                        variant="ink"
                        className="mt-2"
                        onClick={() => date && onLogSession(date)}
                    >
                        <IconPlus /> Log session
                    </Button>
                </div>
            </DrawerContent>
        </Drawer>
    )
}
