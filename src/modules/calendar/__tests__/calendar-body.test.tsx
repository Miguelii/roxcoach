import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CalendarBody } from '@/modules/calendar/calendar-body'
import { makeItem } from '@/modules/calendar/__tests__/fixtures'

const base = {
    view: 'month' as const,
    cursor: '2026-11-19',
    today: '2026-11-19',
    items: [makeItem({ id: 'abc' })],
    isLoading: false,
    onSelectDay: () => {},
}

describe('CalendarBody', () => {
    it('draws the month grid while the first range loads', () => {
        render(<CalendarBody {...base} isLoading items={[]} />)

        expect(screen.getByTestId('month-view')).toHaveAttribute('aria-busy', 'true')
        expect(screen.getByTestId('month-day-2026-11-19')).toBeInTheDocument()
    })

    it('renders the month view with the items', () => {
        render(<CalendarBody {...base} />)

        expect(screen.getByTestId('calendar-chip-abc')).toBeInTheDocument()
    })

    it('renders the week view', () => {
        render(<CalendarBody {...base} view="week" />)

        expect(screen.getByTestId('week-view')).toBeInTheDocument()
        expect(screen.getByTestId('calendar-chip-abc')).toBeInTheDocument()
    })
})
