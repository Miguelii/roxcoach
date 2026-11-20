import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CalendarChip } from '@/modules/calendar/calendar-chip'
import { DayPanel } from '@/modules/calendar/day-panel'
import { getItemKey } from '@/modules/calendar/item-key'
import { computeLoadRatio, computeTotals } from '@/modules/calendar/week-stats'
import { makeItem, makeRaceItem } from '@/modules/calendar/__tests__/fixtures'

describe('race calendar items', () => {
    beforeEach(() => {
        // jsdom has no matchMedia; the day panel reads it through useIsMobile.
        vi.stubGlobal('matchMedia', () => ({
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('renders a race chip with the priority letter linking to /races', () => {
        render(<CalendarChip item={makeRaceItem({ id: 'r1', priority: 'B' })} />)

        const chip = screen.getByTestId('calendar-race-chip-r1')
        expect(chip).toHaveAttribute('href', '/races')
        expect(chip).toHaveAttribute('data-tone', 'amber')
        expect(chip).toHaveTextContent('Hyrox Lisbon')
        expect(screen.getByTestId('calendar-race-chip-r1-priority').textContent).toBe('B')
    })

    it('still renders an activity chip as before', () => {
        render(<CalendarChip item={makeItem({ id: 'abc' })} />)

        expect(screen.getByTestId('calendar-chip-abc')).toHaveAttribute('href', '/activities/abc')
    })

    it('keys an activity and a race with the same id apart', () => {
        expect(getItemKey(makeItem({ id: 'same' }))).not.toBe(
            getItemKey(makeRaceItem({ id: 'same' }))
        )
    })

    it('lists the race and its goal time in the day panel', () => {
        render(
            <DayPanel
                date="2026-11-19"
                items={[makeRaceItem({ id: 'r1', targetTimeS: 4200 })]}
                onClose={() => {}}
            />
        )

        expect(screen.getByTestId('day-panel-race-r1')).toHaveAttribute('href', '/races')
        expect(screen.getByTestId('day-panel-race-r1-goal')).toHaveTextContent('Goal 1:10:00')
        expect(screen.getByTestId('day-panel-race-r1-priority').textContent).toBe('Priority A')
    })

    it('ignores races in the totals and the load ratio', () => {
        const items = [
            makeItem({ id: 'a', localDate: '2026-11-18', movingTimeS: 3600, distanceM: 10_000 }),
            makeRaceItem({ raceDate: '2026-11-18' }),
        ]

        expect(computeTotals(items, '2026-11-16', '2026-11-22')).toEqual({
            doneMinutes: 60,
            doneSessions: 1,
            runKm: 10,
        })
        expect(
            computeLoadRatio([makeRaceItem({ raceDate: '2026-11-18' })], '2026-11-19')
        ).toBeNull()
    })
})
