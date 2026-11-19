'use client'

import { useState } from 'react'
import { IconChevronLeft, IconChevronRight, IconPlus } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/use-mobile'
import { DayPanel } from '@/modules/calendar/day-panel'
import {
    addDays,
    addMonths,
    monthGrid,
    monthLabel,
    shortDateLabel,
    weekDays,
} from '@/modules/calendar/date-utils'
import { CATEGORIES, KINDS } from '@/modules/calendar/kinds'
import { LogSessionDialog } from '@/modules/calendar/log-session-dialog'
import { MonthView } from '@/modules/calendar/month-view'
import { WeekView } from '@/modules/calendar/week-view'
import { CALENDAR_ITEMS, TODAY } from '@/modules/mock/data'
import type { Category } from '@/modules/mock/types'
import { cn } from '@/lib/utils'

type View = 'month' | 'week'

export function Calendar() {
    const isMobile = useIsMobile()
    const [cursor, setCursor] = useState(TODAY)
    const [view, setView] = useState<View>('month')
    const [hidden, setHidden] = useState<Set<Category>>(new Set())
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [logDate, setLogDate] = useState<string | null>(null)

    const effectiveView: View = isMobile ? 'week' : view
    const items = CALENDAR_ITEMS.filter(
        (item) =>
            item.type === 'race' ||
            !hidden.has(item.type === 'activity' ? item.activity.category : item.session.kind)
    )

    const days = weekDays(cursor)
    const title =
        effectiveView === 'month'
            ? monthLabel(cursor)
            : `${shortDateLabel(days[0] ?? cursor)} to ${shortDateLabel(days[6] ?? cursor)}`

    const move = (direction: 1 | -1) =>
        setCursor((current) =>
            effectiveView === 'month'
                ? addMonths(current, direction)
                : addDays(current, direction * 7)
        )

    const toggleCategory = (category: Category) =>
        setHidden((current) => {
            const next = new Set(current)
            if (next.has(category)) next.delete(category)
            else next.add(category)
            return next
        })

    return (
        <section aria-label="Training calendar" className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="display text-4xl">{title}</h2>
                <div className="ml-auto flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label="Previous"
                        onClick={() => move(-1)}
                    >
                        <IconChevronLeft />
                    </Button>
                    <Button variant="outline" onClick={() => setCursor(TODAY)}>
                        Today
                    </Button>
                    <Button variant="outline" size="icon" aria-label="Next" onClick={() => move(1)}>
                        <IconChevronRight />
                    </Button>
                    <Tabs
                        value={view}
                        onValueChange={(value) => setView(value === 'week' ? 'week' : 'month')}
                        className="hidden md:flex"
                    >
                        <TabsList>
                            <TabsTrigger value="month">Month</TabsTrigger>
                            <TabsTrigger value="week">Week</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <Button variant="ink" onClick={() => setLogDate(TODAY)}>
                        <IconPlus /> <span className="hidden sm:inline">Log session</span>
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
                {CATEGORIES.map((category) => {
                    const { label, tone, Icon } = KINDS[category]
                    const off = hidden.has(category)

                    return (
                        <button
                            key={category}
                            type="button"
                            data-tone={tone}
                            aria-pressed={!off}
                            onClick={() => toggleCategory(category)}
                            className={cn(
                                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                                off
                                    ? 'border-hairline-strong text-muted-foreground line-through'
                                    : 'border-transparent bg-tone-soft text-tone-deep'
                            )}
                        >
                            <Icon className="size-3.5" />
                            {label}
                        </button>
                    )
                })}
                <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <span className="size-2.5 rounded-sm bg-blue-soft" /> Done
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="size-2.5 rounded-sm border border-dashed border-blue" />{' '}
                        Planned
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="size-2.5 rounded-sm bg-amber" /> Race
                    </span>
                </span>
            </div>

            {effectiveView === 'month' ? (
                <MonthView
                    weeks={monthGrid(cursor)}
                    month={cursor}
                    items={items}
                    onSelectDay={setSelectedDate}
                />
            ) : (
                <WeekView days={days} items={items} onSelectDay={setSelectedDate} />
            )}

            <DayPanel
                date={selectedDate}
                onClose={() => setSelectedDate(null)}
                onLogSession={(date) => {
                    setSelectedDate(null)
                    setLogDate(date)
                }}
            />
            <LogSessionDialog date={logDate} onClose={() => setLogDate(null)} />
        </section>
    )
}
