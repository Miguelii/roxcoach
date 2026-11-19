import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeekStripView } from '@/modules/dashboard/week-strip-view'
import { makeItem } from '@/modules/calendar/__tests__/fixtures'

describe('WeekStripView', () => {
    it('shows zeros and "No history yet" for an athlete without activities', () => {
        render(<WeekStripView items={[]} today="2026-11-19" />)

        expect(screen.getByTestId('week-tile-time-value')).toHaveTextContent('0m')
        expect(screen.getByTestId('week-tile-sessions-value')).toHaveTextContent('0')
        expect(screen.getByTestId('week-tile-run-value')).toHaveTextContent('0.0 km')
        expect(screen.getByTestId('week-tile-load-value')).toHaveTextContent('No history yet')
        expect(screen.getByTestId('week-strip').textContent).not.toMatch(/planned/iu)
    })

    it('computes the tiles from real activities', () => {
        const items = [
            makeItem({ id: 'a', localDate: '2026-11-18', movingTimeS: 7200, distanceM: 10_000 }),
            makeItem({ id: 'b', localDate: '2026-11-17', movingTimeS: 3600, distanceM: 5000 }),
            makeItem({ id: 'c', localDate: '2026-11-01', movingTimeS: 14_400, distanceM: 20_000 }),
        ]

        render(<WeekStripView items={items} today="2026-11-19" />)

        expect(screen.getByTestId('week-tile-time-value')).toHaveTextContent('3h 00m')
        expect(screen.getByTestId('week-tile-sessions-value')).toHaveTextContent('2')
        expect(screen.getByTestId('week-tile-run-value')).toHaveTextContent('15.0 km')
        expect(screen.getByTestId('week-tile-load-value')).toHaveTextContent('Too high')
    })
})
