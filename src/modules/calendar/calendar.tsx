'use client'

import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/use-mobile'
import { useTRPC } from '@/lib/trpc'
import { CalendarBody } from '@/modules/calendar/calendar-body'
import { useCalendarUrlState } from '@/modules/calendar/use-calendar-url-state'
import { DASHBOARD_QUERY_STALE_TIME } from '@/modules/dashboard/constants'
import { DayPanel } from '@/modules/calendar/day-panel'
import { addDays } from '@/_bff/core/utils/week-dates.utils'
import {
    addMonths,
    monthGrid,
    monthLabel,
    shortDateLabel,
    weekDays,
} from '@/modules/calendar/date-utils'

type Props = {
    today: string
}

/** First and last day shown for the cursor, in the same grid the view renders. */
const visibleRange = (view: 'month' | 'week', cursor: string) => {
    if (view === 'week') {
        const days = weekDays(cursor)
        return { from: days[0] ?? cursor, to: days[6] ?? cursor }
    }

    const weeks = monthGrid(cursor)
    return { from: weeks[0]?.[0] ?? cursor, to: weeks.at(-1)?.[6] ?? cursor }
}

export function Calendar({ today }: Props) {
    const trpc = useTRPC()
    const isMobile = useIsMobile()
    const { cursor, view, setCursor, setView } = useCalendarUrlState(today)
    const [selectedDate, setSelectedDate] = useState<string | null>(null)

    const effectiveView = isMobile ? 'week' : view
    const query = useQuery(
        trpc.training.getCalendar.queryOptions(visibleRange(effectiveView, cursor), {
            placeholderData: keepPreviousData,
            staleTime: DASHBOARD_QUERY_STALE_TIME,
            meta: {
                errorMessage:
                    'Could not load your activities. Check your connection and try again.',
            },
        })
    )

    const items = query.data ?? []

    const selectedItems = items.filter((item) => item.date === selectedDate)

    const days = weekDays(cursor)
    const title =
        effectiveView === 'month'
            ? monthLabel(cursor)
            : `${shortDateLabel(days[0] ?? cursor)} to ${shortDateLabel(days[6] ?? cursor)}`

    const move = (direction: 1 | -1) =>
        void setCursor(
            effectiveView === 'month'
                ? addMonths(cursor, direction)
                : addDays(cursor, direction * 7)
        )

    return (
        <section aria-label="Training calendar" data-testid="calendar" className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
                <h2 data-testid="calendar-title" className="display text-4xl">
                    {title}
                </h2>
                <div className="flex w-full items-center gap-2 md:ml-auto md:w-auto">
                    <Button
                        className="shrink-0"
                        variant="outline"
                        size="icon"
                        aria-label="Previous"
                        onClick={() => move(-1)}
                    >
                        <IconChevronLeft />
                    </Button>
                    <Button
                        className="flex-1 md:flex-none"
                        variant="outline"
                        onClick={() => void setCursor(null)}
                    >
                        Today
                    </Button>
                    <Button
                        className="shrink-0"
                        variant="outline"
                        size="icon"
                        aria-label="Next"
                        data-testid="calendar-next"
                        onClick={() => move(1)}
                    >
                        <IconChevronRight />
                    </Button>
                    <Tabs
                        value={view}
                        onValueChange={(value) => void setView(value === 'week' ? 'week' : 'month')}
                        className="hidden md:flex"
                    >
                        <TabsList>
                            <TabsTrigger value="month" data-testid="calendar-view-month">
                                Month
                            </TabsTrigger>
                            <TabsTrigger value="week" data-testid="calendar-view-week">
                                Week
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            <CalendarBody
                view={effectiveView}
                cursor={cursor}
                today={today}
                items={items}
                isLoading={query.isPending}
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
