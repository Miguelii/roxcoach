'use client'

import { parseAsIsoDate, parseAsStringLiteral, useQueryStates } from 'nuqs'

export type CalendarView = 'month' | 'week'

const CALENDAR_SEARCH_PARAMS = {
    date: parseAsIsoDate,
    view: parseAsStringLiteral(['month', 'week'] as const).withDefault('month'),
}

export function useCalendarUrlState(today: string) {
    const [{ date, view }, setSearchParams] = useQueryStates(CALENDAR_SEARCH_PARAMS, {
        history: 'replace',
    })

    const cursor = date?.toISOString().slice(0, 10) ?? today
    const setCursor = (nextDate: string | null) =>
        setSearchParams({
            date: nextDate ? new Date(`${nextDate}T00:00:00.000Z`) : null,
        })
    const setView = (nextView: CalendarView) => setSearchParams({ view: nextView })

    return { cursor, view, setCursor, setView }
}
