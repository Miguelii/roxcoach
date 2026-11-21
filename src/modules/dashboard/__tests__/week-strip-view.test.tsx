import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeekStripView } from '@/modules/dashboard/week-strip-view'
import { makeItem } from '@/modules/calendar/__tests__/fixtures'

describe('WeekStripView', () => {
    it('shows zeros and "No history yet" for an athlete without activities', () => {
        render(<WeekStripView items={[]} today="2026-11-19" mode="run" />)

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

        render(<WeekStripView items={items} today="2026-11-19" mode="run" />)

        expect(screen.getByTestId('week-tile-time-value')).toHaveTextContent('3h 00m')
        expect(screen.getByTestId('week-tile-sessions-value')).toHaveTextContent('2')
        expect(screen.getByTestId('week-tile-run-value')).toHaveTextContent('15.0 km')
        expect(screen.getByTestId('week-tile-load-value')).toHaveTextContent('Too high')
    })

    describe('in run mode', () => {
        const items = [
            makeItem({
                id: 'r1',
                category: 'run',
                localDate: '2026-11-18',
                movingTimeS: 720,
                distanceM: 2000,
            }),
            makeItem({
                id: 'r2',
                category: 'run',
                localDate: '2026-11-16',
                movingTimeS: 720,
                distanceM: 2000,
            }),
            makeItem({
                id: 's1',
                category: 'strength',
                localDate: '2026-11-17',
                movingTimeS: 3600,
            }),
            makeItem({
                id: 's2',
                category: 'strength',
                localDate: '2026-11-19',
                movingTimeS: 3600,
            }),
            makeItem({
                id: 'h1',
                category: 'hyrox',
                localDate: '2026-11-19',
                movingTimeS: 3600,
            }),
        ]

        it('counts only runs for time and sessions, not strength or other workouts', () => {
            render(<WeekStripView items={items} today="2026-11-19" mode="run" />)

            expect(screen.getByTestId('week-tile-time-value')).toHaveTextContent('24m')
            expect(screen.getByTestId('week-tile-sessions-value')).toHaveTextContent('2')
            expect(screen.getByTestId('week-tile-run-value')).toHaveTextContent('4.0 km')
        })

        it('still shows the load tile', () => {
            render(<WeekStripView items={items} today="2026-11-19" mode="run" />)

            expect(screen.getByTestId('week-tile-load')).toBeInTheDocument()
        })
    })

    describe('in strength mode', () => {
        const items = [
            makeItem({
                id: 'run',
                category: 'run',
                localDate: '2026-11-18',
                movingTimeS: 7200,
                distanceM: 10_000,
            }),
            makeItem({
                id: 's1',
                category: 'strength',
                localDate: '2026-11-17',
                movingTimeS: 3600,
            }),
            makeItem({
                id: 's2',
                category: 'strength',
                localDate: '2026-11-16',
                movingTimeS: 1800,
            }),
            makeItem({
                id: 'old',
                category: 'strength',
                localDate: '2026-11-01',
                movingTimeS: 3600,
            }),
        ]

        it('hides the run distance tile', () => {
            render(<WeekStripView items={items} today="2026-11-19" mode="strength" />)

            expect(screen.queryByTestId('week-tile-run')).toBeNull()
            expect(screen.getByTestId('week-tile-time')).toBeInTheDocument()
            expect(screen.getByTestId('week-tile-sessions')).toBeInTheDocument()
            expect(screen.getByTestId('week-tile-load')).toBeInTheDocument()
        })

        it('counts only strength workouts for time and sessions', () => {
            render(<WeekStripView items={items} today="2026-11-19" mode="strength" />)

            expect(screen.getByTestId('week-tile-sessions-value')).toHaveTextContent('2')
            expect(screen.getByTestId('week-tile-time-value')).toHaveTextContent('1h 30m')
        })

        it('shows zeros when the week has only other kinds of workout', () => {
            render(
                <WeekStripView items={[items[0] ?? items[1]!]} today="2026-11-19" mode="strength" />
            )

            expect(screen.getByTestId('week-tile-sessions-value')).toHaveTextContent('0')
            expect(screen.getByTestId('week-tile-time-value')).toHaveTextContent('0m')
        })
    })
})
