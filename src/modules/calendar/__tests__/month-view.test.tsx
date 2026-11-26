import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MonthView } from '@/modules/calendar/month-view'
import { monthGrid } from '@/modules/calendar/date-utils'
import { makeItem } from '@/modules/calendar/__tests__/fixtures'

const WEEKS = monthGrid('2026-11-19')

const renderView = (items = [makeItem()], onSelectDay = vi.fn(), isLoading = false) =>
    render(
        <MonthView
            weeks={WEEKS}
            month="2026-11-19"
            today="2026-11-19"
            items={items}
            isLoading={isLoading}
            onSelectDay={onSelectDay}
        />
    )

describe('MonthView', () => {
    it('renders an activity chip on its day, linking to the activity', () => {
        renderView([makeItem({ id: 'abc', name: 'Easy run', localDate: '2026-11-18' })])

        const chip = screen.getByTestId('calendar-chip-abc')
        expect(chip).toHaveTextContent('Easy run')
        expect(chip).toHaveAttribute('href', '/activities/abc')
        expect(screen.getByTestId('month-day-2026-11-18')).toContainElement(chip)
    })

    it('marks today', () => {
        renderView()

        expect(screen.getByTestId('month-day-2026-11-19')).toHaveAttribute('data-today', 'true')
        expect(screen.getByTestId('month-day-2026-11-18')).toHaveAttribute('data-today', 'false')
    })

    it('shows an overflow count after three chips', () => {
        const items = ['a', 'b', 'c', 'd', 'e'].map((id) =>
            makeItem({ id, localDate: '2026-11-18' })
        )

        renderView(items)

        expect(screen.getByTestId('month-day-2026-11-18-more')).toHaveTextContent('+2 more')
    })

    it('shows an empty state when there are no activities', () => {
        renderView([])

        expect(screen.getByTestId('month-empty')).toHaveTextContent('No activities')
        expect(screen.queryByTestId('calendar-chip-act-1')).toBeNull()
    })

    it('draws the grid without the empty state or week totals while loading', () => {
        renderView([], vi.fn(), true)

        expect(screen.getByTestId('month-view')).toHaveAttribute('aria-busy', 'true')
        expect(screen.getByTestId('month-day-2026-11-18')).toBeInTheDocument()
        expect(screen.queryByTestId('month-empty')).toBeNull()
        expect(screen.getByTestId('week-summary-2026-11-23-loading')).toBeInTheDocument()
        expect(screen.getByTestId('week-summary-2026-11-23')).not.toHaveTextContent('No sessions')
    })

    it('selects a day from its button', () => {
        const onSelectDay = vi.fn()
        renderView([], onSelectDay)

        fireEvent.click(screen.getByTestId('month-day-2026-11-18-open'))

        expect(onSelectDay).toHaveBeenCalledWith('2026-11-18')
    })

    it('sums the week in the side column', () => {
        renderView([makeItem({ localDate: '2026-11-18', movingTimeS: 2700, distanceM: 8000 })])

        expect(screen.getByTestId('week-summary-2026-11-16')).toHaveTextContent('45m')
        expect(screen.getByTestId('week-summary-2026-11-16')).toHaveTextContent('1 session')
        expect(screen.getByTestId('week-summary-2026-11-23')).toHaveTextContent('No sessions')
    })
})
