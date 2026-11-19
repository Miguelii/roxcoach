'use client'

import { useState } from 'react'
import { keepPreviousData } from '@tanstack/react-query'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import type { ActivityDTO } from '@/_bff/modules/training/types'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/use-mobile'
import { trpcClient } from '@/lib/trpc'
import { CalendarBody } from '@/modules/calendar/calendar-body'
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
import { cn } from '@/lib/utils'

type Props = {
    today: string
}

type View = 'month' | 'week'

type Category = ActivityDTO['category']

/** First and last day shown for the cursor, in the same grid the view renders. */
const visibleRange = (view: View, cursor: string) => {
    if (view === 'week') {
        const days = weekDays(cursor)
        return { from: days[0] ?? cursor, to: days[6] ?? cursor }
    }

    const weeks = monthGrid(cursor)
    return { from: weeks[0]?.[0] ?? cursor, to: weeks.at(-1)?.[6] ?? cursor }
}

export function Calendar({ today }: Props) {
    const isMobile = useIsMobile()
    const [cursor, setCursor] = useState(today)
    const [view, setView] = useState<View>('month')
    const [hidden, setHidden] = useState<Set<Category>>(new Set())
    const [selectedDate, setSelectedDate] = useState<string | null>(null)

    const effectiveView: View = isMobile ? 'week' : view
    const query = trpcClient.training.getCalendar.useQuery(visibleRange(effectiveView, cursor), {
        placeholderData: keepPreviousData,
    })

    const items = (query.data ?? []).filter((item) => !hidden.has(item.activity.category))
    const selectedItems = items.filter((item) => item.date === selectedDate)

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
        <section aria-label="Training calendar" data-testid="calendar" className="space-y-4">
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
                    <Button variant="outline" onClick={() => setCursor(today)}>
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
            </div>

            <CalendarBody
                view={effectiveView}
                cursor={cursor}
                today={today}
                items={items}
                isLoading={query.isPending}
                isError={query.isError}
                onRetry={() => void query.refetch()}
                onSelectDay={setSelectedDate}
            />

            <DayPanel
                date={selectedDate}
                items={selectedItems}
                onClose={() => setSelectedDate(null)}
            />
        </section>
    )
}
