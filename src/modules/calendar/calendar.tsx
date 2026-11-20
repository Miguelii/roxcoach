'use client'

import { useState } from 'react'
import { keepPreviousData } from '@tanstack/react-query'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/use-mobile'
import { trpcClient } from '@/lib/trpc'
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
    const isMobile = useIsMobile()
    const { cursor, view, setCursor, setView } = useCalendarUrlState(today)
    const [selectedDate, setSelectedDate] = useState<string | null>(null)

    const effectiveView = isMobile ? 'week' : view
    const query = trpcClient.training.getCalendar.useQuery(visibleRange(effectiveView, cursor), {
        placeholderData: keepPreviousData,
        staleTime: DASHBOARD_QUERY_STALE_TIME,
    })

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
            <div className="flex flex-wrap items-center gap-3">
                <h2 data-testid="calendar-title" className="display text-4xl">
                    {title}
                </h2>
                <div className="ml-auto flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label="Previous"
                        onClick={() => move(-1)}
                    >
                        <IconChevronLeft />
                    </Button>
                    <Button variant="outline" onClick={() => void setCursor(null)}>
                        Today
                    </Button>
                    <Button
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
