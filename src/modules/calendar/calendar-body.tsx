import type { CalendarItem } from '@/_bff/modules/training/types'
import { Button } from '@/components/ui/button'
import { monthGrid, weekDays } from '@/modules/calendar/date-utils'
import { MonthView } from '@/modules/calendar/month-view'
import { WeekView } from '@/modules/calendar/week-view'

type Props = {
    view: 'month' | 'week'
    cursor: string
    today: string
    items: CalendarItem[]
    isLoading: boolean
    isError: boolean
    onRetry: () => void
    onSelectDay: (date: string) => void
}

/** The calendar content for one visible range: inline error or the chosen view, drawn before its items arrive. */
export function CalendarBody({
    view,
    cursor,
    today,
    items,
    isLoading,
    isError,
    onRetry,
    onSelectDay,
}: Props) {
    if (isError)
        return (
            <div
                data-testid="calendar-error"
                className="flex flex-wrap items-center gap-3 rounded-[var(--radius-surface-inner)] shadow-soft bg-card p-4 text-sm"
            >
                <p className="text-muted-foreground">
                    Could not load your activities. Check your connection and try again.
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    data-testid="calendar-retry"
                    className="ml-auto"
                    onClick={onRetry}
                >
                    Retry
                </Button>
            </div>
        )

    return view === 'month' ? (
        <MonthView
            weeks={monthGrid(cursor)}
            month={cursor}
            today={today}
            items={items}
            isLoading={isLoading}
            onSelectDay={onSelectDay}
        />
    ) : (
        <WeekView
            days={weekDays(cursor)}
            today={today}
            items={items}
            isLoading={isLoading}
            onSelectDay={onSelectDay}
        />
    )
}
