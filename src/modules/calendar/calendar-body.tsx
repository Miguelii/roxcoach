import type { CalendarItem } from '@/_bff/modules/training/types'
import { monthGrid, weekDays } from '@/modules/calendar/date-utils'
import { MonthView } from '@/modules/calendar/month-view'
import { WeekView } from '@/modules/calendar/week-view'

type Props = {
    view: 'month' | 'week'
    cursor: string
    today: string
    items: CalendarItem[]
    isLoading: boolean
    onSelectDay: (date: string) => void
}

/** The calendar content for one visible range: the chosen view, drawn before its items arrive. */
export function CalendarBody({ view, cursor, today, items, isLoading, onSelectDay }: Props) {
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
