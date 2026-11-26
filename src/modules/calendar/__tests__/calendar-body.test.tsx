import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CalendarBody } from '@/modules/calendar/calendar-body'
import { makeItem } from '@/modules/calendar/__tests__/fixtures'

const base = {
    view: 'month' as const,
    cursor: '2026-11-19',
    today: '2026-11-19',
    items: [makeItem({ id: 'abc' })],
    isLoading: false,
    isError: false,
    onRetry: () => {},
    onSelectDay: () => {},
}

describe('CalendarBody', () => {
    it('draws the month grid while the first range loads', () => {
        render(<CalendarBody {...base} isLoading items={[]} />)

        expect(screen.getByTestId('month-view')).toHaveAttribute('aria-busy', 'true')
        expect(screen.getByTestId('month-day-2026-11-19')).toBeInTheDocument()
    })

    it('shows an inline error with a retry button on failure', () => {
        const onRetry = vi.fn()
        render(<CalendarBody {...base} isError items={[]} onRetry={onRetry} />)

        expect(screen.getByTestId('calendar-error')).toHaveTextContent('Could not load')
        fireEvent.click(screen.getByTestId('calendar-retry'))
        expect(onRetry).toHaveBeenCalledTimes(1)
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
