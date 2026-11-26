import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeekView } from '@/modules/calendar/week-view'
import { weekDays } from '@/modules/calendar/date-utils'
import { makeItem } from '@/modules/calendar/__tests__/fixtures'

describe('WeekView', () => {
    it('renders chips per day, a rest label otherwise and marks today', () => {
        render(
            <WeekView
                days={weekDays('2026-11-19')}
                today="2026-11-19"
                items={[makeItem({ id: 'abc', localDate: '2026-11-18' })]}
                isLoading={false}
                onSelectDay={() => {}}
            />
        )

        expect(screen.getByTestId('week-day-2026-11-18')).toContainElement(
            screen.getByTestId('calendar-chip-abc')
        )
        expect(screen.getByTestId('week-day-2026-11-17')).toHaveTextContent('Rest')
        expect(screen.getByTestId('week-day-2026-11-19')).toHaveAttribute('data-today', 'true')
    })

    it('draws the days with placeholders instead of rest labels while loading', () => {
        render(
            <WeekView
                days={weekDays('2026-11-19')}
                today="2026-11-19"
                items={[]}
                isLoading
                onSelectDay={() => {}}
            />
        )

        expect(screen.getByTestId('week-view')).toHaveAttribute('aria-busy', 'true')
        expect(screen.getByTestId('week-day-2026-11-17-loading')).toBeInTheDocument()
        expect(screen.getByTestId('week-day-2026-11-17')).not.toHaveTextContent('Rest')
    })
})
